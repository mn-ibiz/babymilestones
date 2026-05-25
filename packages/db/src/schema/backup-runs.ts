import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Daily DB backup audit trail (X8-S03). One row per backup attempt. Lifecycle:
 *   running → (injected dump pushes a snapshot off-host) → success | failed
 * A separate 30-day retention prune (Decision 35, AC2) stamps `prunedAt` when
 * it deletes a run's off-host snapshot. The restore drill (AC4) reads
 * `location` + `sizeBytes` to locate and verify a snapshot.
 */
export const backupRuns = pgTable(
  "backup_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** running | success | failed */
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Off-host object key/path of the snapshot (NULL on failure). */
    location: text("location"),
    /** Dump size in bytes (NULL until the dump succeeds). */
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /** Populated on failure with the error message. */
    error: text("error"),
    /** Stamped when retention removes this run's off-host snapshot (AC2). */
    prunedAt: timestamp("pruned_at", { withTimezone: true }),
  },
  (t) => ({
    startedAtIdx: index("backup_runs_started_at_idx").on(t.startedAt),
    statusIdx: index("backup_runs_status_idx").on(t.status),
  }),
);

export type BackupRunRow = typeof backupRuns.$inferSelect;
