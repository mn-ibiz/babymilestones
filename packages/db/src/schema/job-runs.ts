import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Job-run ledger (P3-E06-S01 AC2). One row per execution of a registered
 * background job — a scheduled cron tick or an admin "run now" (AC4). The job
 * framework writes the lifecycle: it inserts a `running` row stamped with
 * `startedAt` before invoking the handler, then stamps `endedAt` + a terminal
 * `status` (`success` | `failed`) on completion, recording the `error` message
 * when the handler throws. Reads power the admin observability surface; this
 * table is the canonical record of what ran, when, and whether it succeeded.
 *
 * `trigger` distinguishes a scheduled tick from a manual admin invocation;
 * `triggeredBy` is the acting user id for a manual run (NULL for the scheduler).
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Registered job name (matches `Job.name`). */
    jobName: text("job_name").notNull(),
    /** `running` while in flight, then `success` | `failed`. CHECK-constrained. */
    status: text("status").notNull().default("running"),
    /** `schedule` (cron tick) | `manual` (admin run-now). CHECK-constrained. */
    trigger: text("trigger").notNull().default("schedule"),
    /** Acting user id for a manual run; NULL for the scheduler. */
    triggeredBy: uuid("triggered_by"),
    /** Stamped before the handler is invoked. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Stamped on completion (success or failure); NULL while running. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Error message on a failed run; NULL on success / while running. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobNameStartedAtIdx: index("job_runs_job_name_started_at_idx").on(t.jobName, t.startedAt),
    startedAtIdx: index("job_runs_started_at_idx").on(t.startedAt),
  }),
);

export type JobRunRow = typeof jobRuns.$inferSelect;
export type JobRunInsert = typeof jobRuns.$inferInsert;
