/**
 * Admin sync-health snapshot (P4-E04-S07 / Story 29.7, AC5). Computes, for the
 * admin surface: the last successful pull timestamp, the writeback queue depth,
 * the dead-letter count, the last 10 sync errors, and the >15-min staleness flag
 * that drives the red banner.
 *
 * Recent errors are sourced from the live outbox + the dead-letter table (every
 * failed attempt stamps `last_error`). The admin route may layer in pull errors
 * from `job_runs`; this self-contained helper covers the writeback side and is
 * the unit under test.
 */
import { desc, isNotNull } from "drizzle-orm";
import {
  wcOutbox,
  wcOutboxDead,
  type Database,
  type Transaction,
} from "@bm/db";
import type { WcSyncHealth } from "@bm/contracts";
import { countWcDeadLetters, countWcQueueDepth, getSyncState } from "./sync.js";

type Executor = Database | Transaction;

/** AC5: the last pull must be no older than this or the red banner shows (>15 min). */
export const SYNC_STALE_MS = 15 * 60_000;

export interface ComputeSyncHealthDeps {
  /** Clock for the staleness comparison (defaults to now). */
  now?: Date;
  /**
   * Extra recent errors to fold in (e.g. pull failures from `job_runs`),
   * newest-first; merged with the writeback errors and capped at 10.
   */
  extraErrors?: { source: string; error: string; at: string }[];
}

/** Most recent writeback errors (outbox + dead-letter), newest-first, capped. */
export async function recentSyncErrors(
  db: Executor,
  limit = 10,
): Promise<{ source: string; error: string; at: string }[]> {
  const pending = await db
    .select({ error: wcOutbox.lastError, at: wcOutbox.nextAttemptAt })
    .from(wcOutbox)
    .where(isNotNull(wcOutbox.lastError))
    .orderBy(desc(wcOutbox.nextAttemptAt))
    .limit(limit);
  const dead = await db
    .select({ error: wcOutboxDead.lastError, at: wcOutboxDead.deadLetteredAt })
    .from(wcOutboxDead)
    .where(isNotNull(wcOutboxDead.lastError))
    .orderBy(desc(wcOutboxDead.deadLetteredAt))
    .limit(limit);

  const merged = [
    ...pending.map((r) => ({ source: "writeback", error: r.error ?? "", at: r.at.toISOString() })),
    ...dead.map((r) => ({ source: "dead_letter", error: r.error ?? "", at: r.at.toISOString() })),
  ];
  merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return merged.slice(0, limit);
}

/** Compute the admin sync-health snapshot (AC5). */
export async function computeSyncHealth(
  db: Executor,
  deps: ComputeSyncHealthDeps = {},
): Promise<WcSyncHealth> {
  const now = deps.now ?? new Date();
  const state = await getSyncState(db);
  const queueDepth = await countWcQueueDepth(db);
  const deadLetterCount = await countWcDeadLetters(db);
  const writebackErrors = await recentSyncErrors(db, 10);

  const recentErrors = [...(deps.extraErrors ?? []), ...writebackErrors]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 10);

  const lastPullAt = state.lastPullAt ? state.lastPullAt.toISOString() : null;
  const stale = !state.lastPullAt || now.getTime() - state.lastPullAt.getTime() > SYNC_STALE_MS;

  return { lastPullAt, queueDepth, deadLetterCount, recentErrors, stale };
}
