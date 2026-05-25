import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Outbox-pattern audit table (X5-S01). An audit row is written in the SAME
 * transaction as the business write, so it is the durable audit guarantee.
 * The async projection to `audit_log` is X5-S02.
 *
 * Drain-worker bookkeeping (X5-S02): `attemptCount`/`nextAttemptAt` drive the
 * exponential backoff and `deadLetteredAt` flags rows the worker gave up on
 * (still unprocessed past the 24h threshold) so a poisoned row never blocks the
 * queue. These columns are additive (migration 0040) — S01 rows default cleanly.
 */
export const auditOutbox = pgTable("audit_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  targetTable: text("target_table"),
  targetId: text("target_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  /** Failed drain attempts so far (0 until the worker first fails a row). */
  attemptCount: integer("attempt_count").notNull().default(0),
  /** Earliest time the worker may retry a previously-failed row (backoff gate). */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  /** Set when the worker abandons a row still unprocessed past 24h (dead-letter). */
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
});

export type AuditOutboxRow = typeof auditOutbox.$inferSelect;

/**
 * Query-optimised audit projection (X5-S02). The drain worker copies durable
 * `audit_outbox` rows here oldest-first and reuses the outbox `id` as the PK, so
 * re-projecting a row is a no-op (ON CONFLICT DO NOTHING) — the projection is
 * idempotent and resumable. The audit-log viewer (P1-E10-S03) reads from here.
 * Indexed on the four investigator filters: actor, target, action, time.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    /** Same id as the source audit_outbox row — makes projection idempotent. */
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetTable: text("target_table"),
    targetId: text("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Carried over from the outbox row (when the action happened). */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** When the worker projected this row. */
    projectedAt: timestamp("projected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_target_idx").on(t.targetTable, t.targetId),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
