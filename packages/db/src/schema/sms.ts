import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stub SMS outbox (P1-E01-S05; extended P1-E09-S01, P5-E03). Every outbound
 * message is recorded here so the launch-time stub "delivers" by persisting;
 * tests read the row to obtain the code or inspect the rendered body. The
 * provider-agnostic adapter (`@bm/sms`) writes the row `id` as the queued id and
 * switches to a live provider via one config flag (P5-E03-S02).
 *
 * P5-E03 columns (migration 0074) record the live-provider dispatch outcome:
 * which adapter sent it, the provider's message id, per-message cost (for the
 * spend caps in 33.3), any error text (so a failed send is never silently
 * dropped), the dispatch time, and a `deferred_until` watermark for a message
 * the cap held over to the next window.
 */
export const smsOutbox = pgTable("sms_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  /** Logical template key, e.g. "auth.reset.code". */
  template: text("template"),
  /** Template data bag that produced the rendered body (P1-E09-S01). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  /** Queue status: "queued" | "sent" | "failed" | "deferred" (P5-E03). */
  status: text("status").notNull().default("queued"),
  /** Which adapter dispatched: "stub" | "live" (null until dispatched). */
  provider: text("provider"),
  /** Provider message id from a successful live send (AC3). */
  providerMessageId: text("provider_message_id"),
  /** Per-message cost in minor units (cents) — feeds the spend caps (33.3). */
  costCents: integer("cost_cents"),
  /** Provider error text on a failed send — never silently dropped. */
  error: text("error"),
  /** When a live dispatch completed (sent or failed). */
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  /** When a capped/deferred message becomes eligible again (33.3). */
  deferredUntil: timestamp("deferred_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsOutboxRow = typeof smsOutbox.$inferSelect;
