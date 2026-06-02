/**
 * WooCommerce sync state machine (P4-E04-S07 / Story 29.7). The durable backing
 * for the pull scheduler + the writeback outbox / dead-letter:
 *
 *   PULL (AC1): `getSyncState` reads the singleton checkpoint; the pull job asks
 *   Woo for `modified_after = last_sync_at`, idempotently upserts each order via
 *   `upsertWcOrder`, then `advanceCheckpoint` records the newest modification +
 *   the pull completion (never moving the checkpoint backwards).
 *
 *   WRITEBACK (AC2/AC3): `enqueueWcWriteback` adds a pending row (idempotent on a
 *   stable key — a retry never double-applies a mutation). `claimDueWcWritebacks`
 *   returns due pending rows oldest-first (FIFO). On success `markWcWritebackDone`;
 *   on failure `recordWcWritebackFailure` applies the retry policy:
 *     - retryable (network / 5xx / 429): exponential backoff (1m,5m,30m,2h,6h) up
 *       to 5 attempts, then dead-letter;
 *     - non-retryable (4xx except 429): one retry, then dead-letter.
 *
 *   DEAD-LETTER (AC4): a dead-lettered row moves to `wc_outbox_dead` retaining the
 *   request + last error + timestamps. `listWcDeadLetters` surfaces the un-actioned
 *   rows; `replayWcDeadLetter` re-enqueues, `resolveWcDeadLetter` / `discardWcDeadLetter`
 *   transition the row.
 *
 * This module owns the pure transitions (mirroring `@bm/payments` etims-queue);
 * the jobs (`apps/jobs`) own scheduling + bounded concurrency, and inject the Woo
 * client. No real network here.
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";
import {
  wcOrders,
  wcOutbox,
  wcOutboxDead,
  wcSyncState,
  type Database,
  type Transaction,
  type WcOutboxKind,
  type WcOutboxRow,
  type WcOutboxDeadRow,
  type WcSyncStateRow,
} from "@bm/db";

type Executor = Database | Transaction;

/**
 * AC3: the exponential backoff ladder for the n-th retryable failure (1-based).
 * After the Nth failure the row waits `WC_BACKOFF_MS[N-1]` before the next
 * attempt: 1m → 5m → 30m → 2h → 6h. Exposed for the schedule unit test.
 */
export const WC_BACKOFF_MS: readonly number[] = [
  1 * 60_000, // after attempt 1
  5 * 60_000, // after attempt 2
  30 * 60_000, // after attempt 3
  2 * 60 * 60_000, // after attempt 4
  6 * 60 * 60_000, // after attempt 5
];

/** AC3: a retryable writeback is dead-lettered once it has failed this many times. */
export const WC_MAX_ATTEMPTS = 5;

/** AC3: a non-retryable (4xx except 429) writeback gets exactly one retry. */
export const WC_NON_RETRYABLE_MAX_ATTEMPTS = 2;

/** Backoff delay (ms) after the Nth retryable failure (1-based), clamped to the ladder. */
export function wcBackoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), WC_BACKOFF_MS.length) - 1;
  return WC_BACKOFF_MS[idx]!;
}

// ---------------------------------------------------------------------------
// Checkpoint (AC1)
// ---------------------------------------------------------------------------

/** Read the singleton checkpoint, lazily creating it on first use. */
export async function getSyncState(db: Executor): Promise<WcSyncStateRow> {
  const [existing] = await db.select().from(wcSyncState).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(wcSyncState).values({}).returning();
  return created!;
}

export interface AdvanceCheckpointInput {
  /** The newest order modification observed in the just-completed pull, or null. */
  lastSyncAt: Date | null;
  /** When the pull cycle completed (drives the staleness banner — AC5). */
  now?: Date;
}

/**
 * Record a completed pull: advance `last_sync_at` to the newest modification
 * (never backwards) and stamp `last_pull_at`. A pull that returned nothing still
 * stamps `last_pull_at` (the system is healthy, just idle) without touching the
 * checkpoint.
 */
export async function advanceCheckpoint(
  db: Executor,
  input: AdvanceCheckpointInput,
): Promise<WcSyncStateRow> {
  const now = input.now ?? new Date();
  const state = await getSyncState(db);
  const next =
    input.lastSyncAt && (!state.lastSyncAt || input.lastSyncAt > state.lastSyncAt)
      ? input.lastSyncAt
      : state.lastSyncAt;
  const [row] = await db
    .update(wcSyncState)
    .set({ lastSyncAt: next, lastPullAt: now, updatedAt: now })
    .where(eq(wcSyncState.id, state.id))
    .returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Order upsert (AC1)
// ---------------------------------------------------------------------------

/** The minimal pulled-order shape the upsert reads (a superset is fine). */
export interface PulledOrder {
  id: number;
  status: string;
  number?: string;
  total?: string;
  currency?: string;
  date_created?: string;
  date_modified?: string;
  [k: string]: unknown;
}

/**
 * Idempotently upsert one pulled order on its Woo order id (AC1).
 *
 * On INSERT `local_status` takes its DB default of `'new'`; on UPDATE the set
 * clause deliberately OMITS `local_status` so a re-pull refreshes only the
 * Woo-sourced columns and never clobbers the POS fulfilment workflow state
 * (Story 29.1 / P4-E04-S01 — the POS owns that column).
 */
export async function upsertWcOrder(db: Executor, order: PulledOrder): Promise<void> {
  const now = new Date();
  await db
    .insert(wcOrders)
    .values({
      wooOrderId: order.id,
      status: order.status,
      number: order.number ?? null,
      total: order.total ?? null,
      currency: order.currency ?? null,
      dateCreated: order.date_created ?? null,
      dateModified: order.date_modified ?? null,
      payload: order as unknown as Record<string, unknown>,
      // local_status intentionally unset here — it defaults to 'new' on insert.
    })
    .onConflictDoUpdate({
      target: wcOrders.wooOrderId,
      // local_status intentionally NOT in this set — the POS owns it (Story 29.1).
      set: {
        status: order.status,
        number: order.number ?? null,
        total: order.total ?? null,
        currency: order.currency ?? null,
        dateCreated: order.date_created ?? null,
        dateModified: order.date_modified ?? null,
        payload: order as unknown as Record<string, unknown>,
        updatedAt: now,
      },
    });
}

// ---------------------------------------------------------------------------
// Outbox enqueue + claim (AC2)
// ---------------------------------------------------------------------------

export interface EnqueueWcWritebackInput {
  /** Stable per-operation key — a duplicate enqueue is a no-op (idempotency). */
  idempotencyKey: string;
  kind: WcOutboxKind;
  request: Record<string, unknown>;
  /** Clock (defaults to now); the first attempt is due immediately. */
  now?: Date;
}

/**
 * Enqueue a writeback. Idempotent on `idempotencyKey`: a second enqueue for the
 * same logical operation returns the existing row (the mutation is queued once).
 */
export async function enqueueWcWriteback(
  db: Executor,
  input: EnqueueWcWritebackInput,
): Promise<WcOutboxRow> {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(wcOutbox)
    .values({
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      request: input.request,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      // Stamp the enqueue time so FIFO ordering is deterministic (the DB default
      // would collapse same-tick inserts to one instant).
      createdAt: now,
    })
    .onConflictDoNothing({ target: wcOutbox.idempotencyKey })
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(wcOutbox)
    .where(eq(wcOutbox.idempotencyKey, input.idempotencyKey));
  return existing!;
}

export interface ClaimDueInput {
  now: Date;
  limit: number;
}

/** Claim up to `limit` pending writebacks due (<= now), oldest-first (FIFO — AC2). */
export async function claimDueWcWritebacks(
  db: Executor,
  input: ClaimDueInput,
): Promise<WcOutboxRow[]> {
  return db
    .select()
    .from(wcOutbox)
    .where(and(eq(wcOutbox.status, "pending"), lte(wcOutbox.nextAttemptAt, input.now)))
    .orderBy(asc(wcOutbox.createdAt), asc(wcOutbox.id))
    .limit(input.limit);
}

/** Mark a writeback applied (AC2). */
export async function markWcWritebackDone(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<void> {
  await db
    .update(wcOutbox)
    .set({ status: "done", doneAt: input.now ?? new Date(), lastError: null })
    .where(eq(wcOutbox.id, input.id));
}

export interface RecordFailureInput {
  id: string;
  error: string;
  /**
   * Whether the failure is retryable (network / 5xx / 429). Non-retryable (4xx
   * except 429) gets exactly one retry then dead-letters (AC3).
   */
  retryable: boolean;
  now?: Date;
}

export interface RecordFailureResult {
  outcome: "retry" | "dead_letter";
  attempts: number;
}

/**
 * Record a failed writeback attempt and apply the retry policy (AC3):
 *   - retryable: back off via {@link wcBackoffMs}, staying pending, until
 *     {@link WC_MAX_ATTEMPTS} attempts are reached → dead-letter.
 *   - non-retryable: one retry (due immediately) then dead-letter on the second.
 * Dead-lettering moves the row to `wc_outbox_dead` (retaining request + error +
 * timestamps) and removes it from the live outbox.
 */
export async function recordWcWritebackFailure(
  db: Executor,
  input: RecordFailureInput,
): Promise<RecordFailureResult> {
  const now = input.now ?? new Date();
  const [current] = await db.select().from(wcOutbox).where(eq(wcOutbox.id, input.id));
  if (!current) throw new Error(`wc_outbox row not found: ${input.id}`);
  const attempts = current.attempts + 1;
  const cap = input.retryable ? WC_MAX_ATTEMPTS : WC_NON_RETRYABLE_MAX_ATTEMPTS;

  if (attempts >= cap) {
    await deadLetter(db, current, { attempts, error: input.error, now });
    return { outcome: "dead_letter", attempts };
  }

  // Retryable failures climb the backoff ladder; a non-retryable failure's single
  // retry is due immediately (no exponential wait — the request itself is the fix
  // or it dead-letters on the next pass).
  const nextAttemptAt = input.retryable ? new Date(now.getTime() + wcBackoffMs(attempts)) : now;
  await db
    .update(wcOutbox)
    .set({ status: "pending", attempts, lastError: input.error, nextAttemptAt })
    .where(eq(wcOutbox.id, input.id));
  return { outcome: "retry", attempts };
}

/** Move a live outbox row into the dead-letter table and delete it from the outbox. */
async function deadLetter(
  db: Executor,
  row: WcOutboxRow,
  detail: { attempts: number; error: string; now: Date },
): Promise<void> {
  await db.insert(wcOutboxDead).values({
    idempotencyKey: row.idempotencyKey,
    kind: row.kind,
    request: row.request,
    status: "dead",
    attempts: detail.attempts,
    lastError: detail.error,
    deadLetteredAt: detail.now,
  });
  await db.delete(wcOutbox).where(eq(wcOutbox.id, row.id));
}

// ---------------------------------------------------------------------------
// Dead-letter management (AC4)
// ---------------------------------------------------------------------------

/** List un-actioned dead-letter rows, newest-first (AC4). */
export async function listWcDeadLetters(db: Executor): Promise<WcOutboxDeadRow[]> {
  return db
    .select()
    .from(wcOutboxDead)
    .where(eq(wcOutboxDead.status, "dead"))
    .orderBy(desc(wcOutboxDead.deadLetteredAt));
}

/** Count un-actioned dead-letter rows (the admin health badge — AC5). */
export async function countWcDeadLetters(db: Executor): Promise<number> {
  const rows = await db
    .select({ id: wcOutboxDead.id })
    .from(wcOutboxDead)
    .where(eq(wcOutboxDead.status, "dead"));
  return rows.length;
}

/** Count pending writebacks (the admin health queue-depth — AC5). */
export async function countWcQueueDepth(db: Executor): Promise<number> {
  const rows = await db
    .select({ id: wcOutbox.id })
    .from(wcOutbox)
    .where(eq(wcOutbox.status, "pending"));
  return rows.length;
}

/** Load one dead row by id (any status). */
async function getDeadLetter(db: Executor, id: string): Promise<WcOutboxDeadRow | null> {
  const [row] = await db.select().from(wcOutboxDead).where(eq(wcOutboxDead.id, id));
  return row ?? null;
}

/**
 * Replay a dead-lettered writeback (AC4): re-enqueue its request into the live
 * outbox (fresh attempts, due immediately) and mark the dead row resolved. Only a
 * still-`dead` row may be replayed. Returns the re-enqueued outbox row.
 */
export async function replayWcDeadLetter(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<WcOutboxRow> {
  const now = input.now ?? new Date();
  const dead = await getDeadLetter(db, input.id);
  if (!dead || dead.status !== "dead") {
    throw new Error(`No replayable dead-letter with id ${input.id}`);
  }
  // Re-enqueue under the SAME idempotency key so the operation stays single-shot.
  // A prior `done`/`pending` row with that key would block the re-enqueue, so we
  // clear any stale terminal row first, then insert fresh.
  await db.delete(wcOutbox).where(eq(wcOutbox.idempotencyKey, dead.idempotencyKey));
  const [enqueued] = await db
    .insert(wcOutbox)
    .values({
      idempotencyKey: dead.idempotencyKey,
      kind: dead.kind,
      request: dead.request,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    })
    .returning();
  await db
    .update(wcOutboxDead)
    .set({ status: "resolved", resolvedAt: now })
    .where(eq(wcOutboxDead.id, input.id));
  return enqueued!;
}

/** Mark a dead-lettered writeback manually resolved (AC4). */
export async function resolveWcDeadLetter(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<WcOutboxDeadRow> {
  const now = input.now ?? new Date();
  const dead = await getDeadLetter(db, input.id);
  if (!dead || dead.status !== "dead") {
    throw new Error(`No actionable dead-letter with id ${input.id}`);
  }
  const [row] = await db
    .update(wcOutboxDead)
    .set({ status: "resolved", resolvedAt: now })
    .where(eq(wcOutboxDead.id, input.id))
    .returning();
  return row!;
}

/** Discard a dead-lettered writeback — drop it permanently (AC4). */
export async function discardWcDeadLetter(
  db: Executor,
  input: { id: string; now?: Date },
): Promise<WcOutboxDeadRow> {
  const now = input.now ?? new Date();
  const dead = await getDeadLetter(db, input.id);
  if (!dead || dead.status !== "dead") {
    throw new Error(`No actionable dead-letter with id ${input.id}`);
  }
  const [row] = await db
    .update(wcOutboxDead)
    .set({ status: "discarded", discardedAt: now })
    .where(eq(wcOutboxDead.id, input.id))
    .returning();
  return row!;
}
