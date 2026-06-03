import {
  audit,
  type Database,
} from "@bm/db";
import {
  claimDueEtimsSubmissions,
  markEtimsSubmissionSent,
  recordEtimsSubmissionFailure,
  type EtimsQueueRow,
} from "@bm/payments";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

/** 60s cadence: the queue is low-volume, and 24h backoff dominates real waits. */
const DEFAULT_INTERVAL_MS = 60_000;
/** Bound the work per tick so one run can't monopolise the runner. */
const DEFAULT_BATCH = 50;

/** Minimal structured-logger shape the job needs (the shared jobs logger fits). */
export interface EtimsRetryLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Re-submit one queued eTIMS receipt to KRA. Injected so the worker is pure of
 * transport: production wires the eTIMS adapter (which uses the queued payload +
 * the row's stable idempotency key so a retry never double-registers a KRA
 * invoice); tests pass a fake. Resolving means "accepted by KRA"; throwing means
 * "still failing" (transient or terminal — the worker backs off / dead-letters).
 */
export type EtimsResubmit = (row: EtimsQueueRow) => Promise<void>;

export interface EtimsRetryJobDeps {
  db: Database;
  /** Re-submit a queued receipt to eTIMS (transport-backed; idempotent). */
  resubmit: EtimsResubmit;
  /** Clock injection for deterministic backoff windows in tests. */
  now?: () => Date;
  /** Structured logger (defaults to the jobs logger). */
  logger?: EtimsRetryLogger;
  /** Per-tick batch size (tests use a small value). */
  batchSize?: number;
}

/**
 * eTIMS retry + dead-letter worker (P5-E02-S02). Runs on the established jobs
 * pattern (`createXJob(deps): Job`, like `mpesa-reconcile`). Each tick it claims
 * due `pending` rows from `kra_etims_queue` (AC1) and re-submits them to KRA:
 *
 *   - success → mark `sent` (AC2);
 *   - failure → increment attempts, set the next exponential-backoff window (up
 *     to 24h), and dead-letter the row once it exhausts its attempts (AC2). A
 *     dead-letter writes an audit row (`etims.submission.dead_lettered`) — that
 *     is the alert (AC2) the admin Settings view (AC3) surfaces.
 *
 * Idempotency lives in `resubmit` (the queued payload carries a stable
 * `(series, sequence)` key), so a retried submission never duplicates a KRA
 * invoice. A submit error never aborts the batch — each row is isolated.
 */
export function createEtimsRetryJob(deps: EtimsRetryJobDeps): Job {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH;

  return {
    name: "etims-retry",
    intervalMs: DEFAULT_INTERVAL_MS,
    // Declared cadence for the registry/observability surface (mirrors sms-retry /
    // mpesa-reconcile). The scheduler runs off intervalMs; this exposes the intent.
    cron: "* * * * *",
    run: async () => {
      const at = now();
      const due = await claimDueEtimsSubmissions(db, { now: at, limit: batchSize });
      let sent = 0;
      let failed = 0;
      let deadLettered = 0;

      for (const row of due) {
        try {
          await deps.resubmit(row);
          await markEtimsSubmissionSent(db, { id: row.id, now: at });
          await audit(db, {
            actor: null,
            action: "etims.submission.sent",
            target: { table: "kra_etims_queue", id: row.id },
            payload: { idempotency_key: row.idempotencyKey, attempts: row.attempts },
          });
          sent += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const result = await recordEtimsSubmissionFailure(db, {
            id: row.id,
            error: message,
            now: at,
          });
          failed += 1;
          if (result.status === "dead_letter") {
            deadLettered += 1;
            // The dead-letter audit IS the alert (AC2). It carries enough to
            // triage from the admin Settings view without leaking the payload.
            await audit(db, {
              actor: null,
              action: "etims.submission.dead_lettered",
              target: { table: "kra_etims_queue", id: row.id },
              payload: {
                idempotency_key: row.idempotencyKey,
                series: row.series,
                sequence_number: row.sequenceNumber,
                attempts: result.attempts,
                last_error: message,
              },
            });
            log.error(
              { event: "etims.retry.dead_letter", id: row.id, idempotency_key: row.idempotencyKey, last_error: message },
              "eTIMS submission dead-lettered — manual intervention required",
            );
          }
        }
      }

      log.info(
        { event: "etims.retry", claimed: due.length, sent, failed, dead_lettered: deadLettered },
        `eTIMS retry: ${sent} sent, ${failed} failed (${deadLettered} dead-lettered) of ${due.length} due`,
      );
    },
  };
}
