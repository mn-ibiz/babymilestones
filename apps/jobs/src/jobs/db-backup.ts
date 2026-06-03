import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, backupRuns, type Database } from "@bm/db";
import type { Job } from "../registry.js";

/** Result of a successful off-host snapshot. */
export interface BackupResult {
  /** Off-host object key/path the snapshot was written to. */
  location: string;
  /** Snapshot size in bytes. */
  sizeBytes: number;
}

/**
 * The actual pg_dump + off-host upload, INJECTED so tests never shell out or
 * touch cloud storage. Production wires a real implementation (pg_dump piped to
 * the object store) when infra lands; tests pass a mock.
 */
export type BackupDump = () => Promise<BackupResult>;

/** Off-host store slice the retention prune needs (delete by location). */
export interface BackupStore {
  remove(location: string): Promise<void>;
}

export interface DbBackupJobDeps {
  db: Database;
  /** Off-host object store (only `remove` is used here; the dump uploads). */
  store: BackupStore;
  /** Injected pg_dump + upload — mockable, never a real shell call in tests. */
  dump: BackupDump;
  /** Clock injection for deterministic retention windows in tests. */
  now?: () => Date;
}

/** AC2 / Decision 35 — fixed 30-day retention for P1. */
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily DB backup + retention cron (X8-S03).
 *
 * Each run:
 * 1. Inserts a `running` `backup_runs` row (AC3 — every run is recorded).
 * 2. Invokes the INJECTED dump (pg_dump → off-host store, AC1) and stamps the
 *    row `success` (location + size) or `failed` (error). A dump failure is
 *    recorded, not thrown, so the cron keeps running tomorrow.
 * 3. Prunes snapshots older than 30 days (AC2): for each un-pruned successful
 *    run past the window, deletes the off-host object and stamps `prunedAt`.
 *
 * The actual dump/upload and the off-host store are injected; tests mock both.
 * The restore drill (AC4) is a documented manual procedure under `infra/`.
 */
export function createDbBackupJob(deps: DbBackupJobDeps): Job {
  const now = deps.now ?? (() => new Date());

  return {
    name: "db-backup",
    intervalMs: DAY_MS,
    run: async () => {
      const at = now();

      const [run] = await deps.db
        .insert(backupRuns)
        .values({ status: "running", startedAt: at })
        .returning({ id: backupRuns.id });
      const runId = run!.id;

      try {
        const result = await deps.dump();
        await deps.db
          .update(backupRuns)
          .set({
            status: "success",
            finishedAt: now(),
            location: result.location,
            sizeBytes: result.sizeBytes,
          })
          .where(eq(backupRuns.id, runId));
        await audit(deps.db, {
          actor: null,
          action: "backup.run.succeeded",
          target: { table: "backup_runs", id: runId },
          payload: { location: result.location, size_bytes: result.sizeBytes },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await deps.db
          .update(backupRuns)
          .set({ status: "failed", finishedAt: now(), error: message })
          .where(eq(backupRuns.id, runId));
        await audit(deps.db, {
          actor: null,
          action: "backup.run.failed",
          target: { table: "backup_runs", id: runId },
          payload: { error: message },
        });
        // Re-throw so the jobs runner reports this to the error tracker (it only
        // alerts when run() rejects). onFailure defaults to retry-next-tick, so the
        // daily cron still re-attempts tomorrow — and the prune below is SKIPPED, so
        // retention never runs on a day the backup failed.
        throw err;
      }

      await prune(deps, at, now);
    },
  };
}

/**
 * AC2 — delete off-host snapshots older than 30 days, stamp `prunedAt`. ALWAYS
 * keeps the single most-recent successful snapshot regardless of age, so a
 * prolonged dump-failure streak can never let retention destroy the last good
 * backup (mirrors backup-retention.ts Rule 1).
 */
async function prune(deps: DbBackupJobDeps, at: Date, now: () => Date): Promise<void> {
  const cutoff = new Date(at.getTime() - RETENTION_DAYS * DAY_MS);

  // All un-pruned successful snapshots, newest first.
  const successes = await deps.db
    .select({
      id: backupRuns.id,
      location: backupRuns.location,
      startedAt: backupRuns.startedAt,
    })
    .from(backupRuns)
    .where(and(eq(backupRuns.status, "success"), isNull(backupRuns.prunedAt)))
    .orderBy(desc(backupRuns.startedAt));

  // Protect the most-recent successful snapshot; only the rest are prune-eligible.
  for (const row of successes.slice(1)) {
    if (!row.location) continue;
    if (row.startedAt >= cutoff) continue; // still within the retention window
    await deps.store.remove(row.location);
    await deps.db
      .update(backupRuns)
      .set({ prunedAt: now() })
      .where(eq(backupRuns.id, row.id));
    await audit(deps.db, {
      actor: null,
      action: "backup.run.pruned",
      target: { table: "backup_runs", id: row.id },
      payload: { location: row.location },
    });
  }
}
