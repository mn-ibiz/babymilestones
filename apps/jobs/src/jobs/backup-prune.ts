import { eq } from "drizzle-orm";
import { audit, backupRuns, settings, type Database } from "@bm/db";
import {
  BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_BACKUP_RETENTION_POLICY,
  backupRetentionPolicySchema,
  type BackupRetentionPolicy,
} from "@bm/contracts";
import type { Job } from "../registry.js";
import { selectBackupsToPrune, type PrunableBackup } from "./backup-retention.js";

/** Off-host store slice the pruner needs (delete a snapshot by location). */
export interface BackupStore {
  remove(location: string): Promise<void>;
}

export interface BackupPruneJobDeps {
  db: Database;
  /** Off-host object store; production wires the real one when infra lands. */
  store: BackupStore;
  /** Clock injection for deterministic retention windows in tests. */
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve the effective retention policy from `settings`, falling back to the
 * defaults if it is unset or malformed. Never throws — a missing/garbled policy
 * must not stop the pruner from running with safe defaults.
 */
async function loadPolicy(db: Database): Promise<BackupRetentionPolicy> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, BACKUP_RETENTION_SETTING_KEY))
    .limit(1);
  if (!row) return DEFAULT_BACKUP_RETENTION_POLICY;
  const parsed = backupRetentionPolicySchema.safeParse(row.value);
  return parsed.success ? parsed.data : DEFAULT_BACKUP_RETENTION_POLICY;
}

/**
 * Daily backup pruner (P2-E06-S02). Reads the admin-configured retention policy
 * (21-1) and deletes the off-host snapshots of backups that fall outside it,
 * stamping `backup_runs.prunedAt` and writing an audit row per deletion.
 *
 * The retention DECISION is the pure `selectBackupsToPrune`; this job is the I/O
 * shell. Guarantees (enforced by the selector): the most-recent successful
 * backup is never deleted, nothing inside the grace window is deleted, and
 * already-pruned / failed / location-less runs are ignored — so re-running the
 * job is idempotent.
 */
export function createBackupPruneJob(deps: BackupPruneJobDeps): Job {
  const now = deps.now ?? (() => new Date());

  return {
    name: "backup-prune",
    intervalMs: DAY_MS,
    run: async () => {
      const at = now();
      const policy = await loadPolicy(deps.db);

      const rows = await deps.db
        .select({
          id: backupRuns.id,
          startedAt: backupRuns.startedAt,
          status: backupRuns.status,
          location: backupRuns.location,
          prunedAt: backupRuns.prunedAt,
        })
        .from(backupRuns);

      const toPrune = selectBackupsToPrune(rows as PrunableBackup[], policy, at);

      for (const row of toPrune) {
        if (!row.location) continue; // selector guarantees this; defensive
        await deps.store.remove(row.location);
        await deps.db
          .update(backupRuns)
          .set({ prunedAt: at })
          .where(eq(backupRuns.id, row.id));
        await audit(deps.db, {
          actor: null,
          action: "backup.run.pruned",
          target: { table: "backup_runs", id: row.id },
          payload: { location: row.location },
        });
      }
    },
  };
}
