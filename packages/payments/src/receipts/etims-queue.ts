/**
 * eTIMS submission queue (P5-E02-S02). The durable retry / dead-letter state
 * machine behind the `kra_etims_queue` table:
 *
 *   enqueue → pending ──(retry success)──▶ sent
 *                 │
 *                 └──(retry failure)──▶ pending (backoff)  …until attempts
 *                                         exhaust max_attempts ──▶ dead_letter
 *
 * The retry worker (`apps/jobs`) claims due pending rows and re-submits; this
 * module owns the pure backoff math + the row transitions. Idempotency is by the
 * stable `<series>-<sequence>` key (UNIQUE), so a receipt is queued once and a
 * retry can never double-register a KRA invoice.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { kraEtimsQueue, type Database, type Transaction } from "@bm/db";
import { formatReceiptNumber, type WriteReceiptPayload } from "./index.js";

type Executor = Database | Transaction;

/** Backoff cap — failures never wait longer than 24h before the next attempt. */
export const ETIMS_BACKOFF_CAP_MS = 24 * 60 * 60 * 1000;
/** Base backoff — the first failure waits 1 minute. */
export const ETIMS_BACKOFF_BASE_MS = 60 * 1000;
/** Default attempts before a submission is dead-lettered. */
export const ETIMS_DEFAULT_MAX_ATTEMPTS = 10;

/**
 * Exponential backoff for the n-th attempt (1-based): `1m * 2^(n-1)`, capped at
 * 24h. `etimsBackoffMs(1) === 60_000`; growth doubles each attempt.
 */
export function etimsBackoffMs(attempt: number): number {
  if (attempt <= 1) return ETIMS_BACKOFF_BASE_MS;
  const ms = ETIMS_BACKOFF_BASE_MS * 2 ** (attempt - 1);
  return Math.min(ms, ETIMS_BACKOFF_CAP_MS);
}

/** A queued eTIMS submission, camelCased for the worker / admin surfaces. */
export interface EtimsQueueRow {
  id: string;
  idempotencyKey: string;
  series: string;
  sequenceNumber: number;
  payload: WriteReceiptPayload;
  status: "pending" | "sent" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
  deadLetteredAt: Date | null;
}

type Row = typeof kraEtimsQueue.$inferSelect;

function toRow(r: Row): EtimsQueueRow {
  return {
    id: r.id,
    idempotencyKey: r.idempotencyKey,
    series: r.series,
    sequenceNumber: r.sequenceNumber,
    payload: r.payload as unknown as WriteReceiptPayload,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    nextAttemptAt: r.nextAttemptAt,
    lastError: r.lastError,
    sentAt: r.sentAt,
    deadLetteredAt: r.deadLetteredAt,
  };
}

export interface EnqueueEtimsInput {
  series: string;
  sequenceNumber: number;
  payload: WriteReceiptPayload;
  /** The failure that triggered the enqueue (recorded as the initial last_error). */
  error: string;
  /** Clock injection (defaults to now); the first retry is due immediately. */
  now?: Date;
  /** Override the attempt budget before dead-lettering. */
  maxAttempts?: number;
}

/**
 * Enqueue a failed eTIMS submission for retry. Idempotent on the
 * `<series>-<sequence>` key: a second enqueue for the same receipt is a no-op
 * that returns the existing row (the receipt is queued once).
 */
export async function enqueueEtimsSubmission(
  db: Executor,
  input: EnqueueEtimsInput,
): Promise<EtimsQueueRow> {
  const idempotencyKey = formatReceiptNumber(input.series, input.sequenceNumber);
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(kraEtimsQueue)
    .values({
      idempotencyKey,
      series: input.series,
      sequenceNumber: input.sequenceNumber,
      payload: input.payload as unknown as Record<string, unknown>,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? ETIMS_DEFAULT_MAX_ATTEMPTS,
      // The first retry is due immediately; failures push next_attempt_at out.
      nextAttemptAt: now,
      lastError: input.error,
    })
    .onConflictDoNothing({ target: kraEtimsQueue.idempotencyKey })
    .returning();

  if (row) return toRow(row);

  // Conflict: the receipt is already queued — return the existing row.
  const [existing] = await db
    .select()
    .from(kraEtimsQueue)
    .where(eq(kraEtimsQueue.idempotencyKey, idempotencyKey));
  return toRow(existing!);
}

export interface ClaimDueInput {
  now: Date;
  limit: number;
}

/** Claim up to `limit` pending rows whose `next_attempt_at` is due (<= now). */
export async function claimDueEtimsSubmissions(
  db: Executor,
  input: ClaimDueInput,
): Promise<EtimsQueueRow[]> {
  const rows = await db
    .select()
    .from(kraEtimsQueue)
    .where(and(eq(kraEtimsQueue.status, "pending"), lte(kraEtimsQueue.nextAttemptAt, input.now)))
    .orderBy(asc(kraEtimsQueue.nextAttemptAt))
    .limit(input.limit);
  return rows.map(toRow);
}

/** Mark a submission accepted by KRA. Guarded on `status='pending'` so a concurrent
 *  transition (a racing failure-record / dead-letter) can't be silently clobbered. */
export async function markEtimsSubmissionSent(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<void> {
  await db
    .update(kraEtimsQueue)
    .set({ status: "sent", sentAt: input.now ?? new Date() })
    .where(and(eq(kraEtimsQueue.id, input.id), eq(kraEtimsQueue.status, "pending")));
}

export interface RecordFailureResult {
  status: "pending" | "dead_letter";
  attempts: number;
}

/**
 * Record a failed retry: increment attempts, store the error, and either back
 * off (still pending, `next_attempt_at` pushed out by {@link etimsBackoffMs}) or
 * dead-letter the row once attempts reach `max_attempts`.
 */
export async function recordEtimsSubmissionFailure(
  db: Executor,
  input: { id: string; error: string; now?: Date },
): Promise<RecordFailureResult> {
  const now = input.now ?? new Date();
  const [current] = await db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, input.id));
  if (!current) {
    throw new Error(`eTIMS queue row not found: ${input.id}`);
  }
  // Only a still-pending row can fail-and-retry. A concurrent worker tick (or an
  // admin requeue) may already have moved it — report the row's actual state
  // rather than re-incrementing.
  if (current.status !== "pending") {
    return { status: current.status === "dead_letter" ? "dead_letter" : "pending", attempts: current.attempts };
  }
  const attempts = current.attempts + 1;
  // Compare-and-set: scope the UPDATE to the observed (status, attempts) so two
  // interleaving failure-records can't both write attempts+1 (lost-update on the
  // counter) and a failure can't clobber a concurrent requeue/mark-sent. A 0-row
  // result means another writer moved it first — re-read and report the truth.
  const guard = and(
    eq(kraEtimsQueue.id, input.id),
    eq(kraEtimsQueue.status, "pending"),
    eq(kraEtimsQueue.attempts, current.attempts),
  );

  if (attempts >= current.maxAttempts) {
    const updated = await db
      .update(kraEtimsQueue)
      .set({ status: "dead_letter", attempts, lastError: input.error, deadLetteredAt: now })
      .where(guard)
      .returning();
    if (updated.length === 0) {
      const [fresh] = await db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, input.id));
      return {
        status: fresh?.status === "dead_letter" ? "dead_letter" : "pending",
        attempts: fresh?.attempts ?? attempts,
      };
    }
    return { status: "dead_letter", attempts };
  }

  const nextAttemptAt = new Date(now.getTime() + etimsBackoffMs(attempts));
  const updated = await db
    .update(kraEtimsQueue)
    .set({ status: "pending", attempts, lastError: input.error, nextAttemptAt })
    .where(guard)
    .returning();
  if (updated.length === 0) {
    const [fresh] = await db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, input.id));
    return {
      status: fresh?.status === "dead_letter" ? "dead_letter" : "pending",
      attempts: fresh?.attempts ?? attempts,
    };
  }
  return { status: "pending", attempts };
}

/** List every dead-lettered submission (admin inspection, AC3). */
export async function listDeadLetters(db: Executor): Promise<EtimsQueueRow[]> {
  const rows = await db
    .select()
    .from(kraEtimsQueue)
    .where(eq(kraEtimsQueue.status, "dead_letter"))
    .orderBy(asc(kraEtimsQueue.deadLetteredAt));
  return rows.map(toRow);
}

/**
 * Re-queue a dead-lettered submission for another attempt (admin, AC3): reset to
 * pending, clear the attempt count + dead-letter mark, due immediately.
 */
export async function requeueDeadLetter(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<EtimsQueueRow> {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(kraEtimsQueue)
    .set({ status: "pending", attempts: 0, deadLetteredAt: null, nextAttemptAt: now })
    .where(eq(kraEtimsQueue.id, input.id))
    .returning();
  return toRow(row!);
}
