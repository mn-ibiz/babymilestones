import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stub SMS outbox (P1-E01-S05). Every outbound message is recorded here so the
 * launch-time stub "delivers" by persisting; tests read the row to obtain the
 * code. The provider-agnostic adapter that drains this table is epic P1-E09.
 */
export const smsOutbox = pgTable("sms_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  /** Logical template name, e.g. "auth.reset.code". */
  template: text("template"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsOutboxRow = typeof smsOutbox.$inferSelect;
