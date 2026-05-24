import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Outbox-pattern audit table (X5-S01). An audit row is written in the SAME
 * transaction as the business write, so it is the durable audit guarantee.
 * The async projection to `audit_log` is X5-S02.
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
});

export type AuditOutboxRow = typeof auditOutbox.$inferSelect;
