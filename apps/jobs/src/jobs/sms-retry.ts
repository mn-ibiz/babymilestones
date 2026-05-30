import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { audit, smsOutbox, type Database, type SmsOutboxRow } from "@bm/db";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** Poll cadence — the worker scans for due failed rows once a minute. */
const POLL_INTERVAL_MS = 60_000;
/** AC1/AC3: a message is dead-lettered once it has failed this many times. */
export const MAX_ATTEMPTS = 5;
/** Rows processed per run, oldest-first; the rest follow on the next tick. */
const DEFAULT_BATCH_SIZE = 200;

/**
 * AC2: exponential backoff schedule, indexed by the NEW attempt count after a
 * failure. After the Nth failure (1-indexed) the row waits BACKOFF_MS[N-1] before
 * the next attempt: 1m → 5m → 30m → 2h → (12h is moot — attempt 5 dead-letters).
 * Exposed for the test that asserts the exact ladder.
 */
export const BACKOFF_MS: readonly number[] = [
  1 * 60_000, // after attempt 1
  5 * 60_000, // after attempt 2
  30 * 60_000, // after attempt 3
  2 * 60 * 60_000, // after attempt 4
  12 * 60 * 60_000, // after attempt 5 (only used if MAX_ATTEMPTS were raised)
];

/** Backoff delay (ms) after the Nth failed attempt (1-indexed), clamped. */
export function backoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[idx]!;
}

/** Send one SMS. Resolves on provider success; throws on a delivery failure. */
export type SmsResend = (row: SmsOutboxRow) => Promise<void>;

/** Minimal structured-logger shape the worker needs. */
export interface SmsRetryLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface SmsRetryJobDeps {
  db: Database;
  /** The provider (re)send. Required — the worker can't deliver without it. */
  resend: SmsResend;
  /** Structured logger for the per-run summary + dead-letter alerts. */
  logger?: SmsRetryLogger;
  /** Clock injection for deterministic backoff windows in tests. */
  now?: () => Date;
  /** Override the per-run batch size (tests use a small value). */
  batchSize?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * SMS retry worker (P3-E06-S04). Each tick it picks `sms_outbox` rows that are
 * `failed`, have not yet hit the attempt cap, are not dead-lettered, and whose
 * backoff gate (`next_attempt_at`) has elapsed (AC1), oldest-first. For each it
 * calls the injected provider `resend`:
 *  - success → status `sent`, `sent_at` stamped, gate cleared.
 *  - failure → `attempt_count++`; if it has now reached {@link MAX_ATTEMPTS} the
 *    row is DEAD-LETTERED (status `dead_lettered`, `dead_lettered_at` stamped),
 *    an audit row is written and an alert is logged (AC3); otherwise
 *    `next_attempt_at` is set from the exponential backoff ladder (AC2) and it is
 *    retried on a later tick.
 *
 * Each row is isolated: a `resend` that throws is caught and recorded, never
 * aborting the rest of the batch. The run logs its sent / re-queued /
 * dead-lettered counts.
 */
export function createSmsRetryJob(deps: SmsRetryJobDeps): Job {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;

  return {
    name: "sms-retry",
    intervalMs: POLL_INTERVAL_MS,
    cron: "* * * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = now();

      // AC1: failed + under the cap + not dead-lettered + past the backoff gate.
      const due = await db
        .select()
        .from(smsOutbox)
        .where(
          and(
            eq(smsOutbox.status, "failed"),
            lt(smsOutbox.attemptCount, MAX_ATTEMPTS),
            isNull(smsOutbox.deadLetteredAt),
            or(isNull(smsOutbox.nextAttemptAt), lte(smsOutbox.nextAttemptAt, at)),
          ),
        )
        .orderBy(asc(smsOutbox.createdAt), asc(smsOutbox.id))
        .limit(batchSize);

      let sent = 0;
      let requeued = 0;
      let deadLettered = 0;

      for (const row of due) {
        try {
          await deps.resend(row);
          await db
            .update(smsOutbox)
            .set({ status: "sent", sentAt: at, nextAttemptAt: null, lastError: null })
            .where(eq(smsOutbox.id, row.id));
          sent += 1;
        } catch (err) {
          const attempt = row.attemptCount + 1;
          const message = errorMessage(err);
          if (attempt >= MAX_ATTEMPTS) {
            // AC3: dead-letter + alert. The status + audit make it discoverable.
            await db
              .update(smsOutbox)
              .set({
                status: "dead_lettered",
                attemptCount: attempt,
                deadLetteredAt: at,
                lastError: message,
              })
              .where(eq(smsOutbox.id, row.id));
            await audit(db, {
              actor: null,
              action: "sms.retry.dead_lettered",
              target: { table: "sms_outbox", id: row.id },
              payload: { phone: row.phone, template: row.template, attempts: attempt, last_error: message },
            });
            log.error(
              { event: "sms.retry.dead_lettered", sms_id: row.id, attempts: attempt, err: message },
              "sms dead-lettered after max attempts",
            );
            deadLettered += 1;
          } else {
            // AC2: bump attempt + schedule the next attempt via exponential backoff.
            await db
              .update(smsOutbox)
              .set({
                attemptCount: attempt,
                nextAttemptAt: new Date(at.getTime() + backoffMs(attempt)),
                lastError: message,
              })
              .where(eq(smsOutbox.id, row.id));
            log.warn(
              { event: "sms.retry.requeued", sms_id: row.id, attempt, err: message },
              "sms resend failed, scheduled for retry",
            );
            requeued += 1;
          }
        }
      }

      log.info(
        { event: "sms.retry", sent, requeued, dead_lettered: deadLettered, due: due.length },
        `sms retry: sent ${sent}, requeued ${requeued}, dead-lettered ${deadLettered}`,
      );
    },
  };
}
