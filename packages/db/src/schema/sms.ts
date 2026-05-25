import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stub SMS outbox (P1-E01-S05; extended P1-E09-S01). Every outbound message is
 * recorded here so the launch-time stub "delivers" by persisting; tests read
 * the row to obtain the code or inspect the rendered body. The provider-agnostic
 * adapter (`@bm/sms`) writes the row `id` as the queued id and switches to a
 * live provider via one config flag in P5-E03.
 */
export const smsOutbox = pgTable("sms_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  /** Logical template key, e.g. "auth.reset.code". */
  template: text("template"),
  /** Template data bag that produced the rendered body (P1-E09-S01). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  /** Queue status: "queued" until a live provider dispatches it (P5-E03). */
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsOutboxRow = typeof smsOutbox.$inferSelect;
