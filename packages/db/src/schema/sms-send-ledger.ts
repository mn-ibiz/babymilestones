import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `sms_send_ledger` (P5-E03-S03) — durable rolling-window accounting for the
 * live SMS path. The rate/cost limiter writes one row per *dispatched* message
 * (after the wrapped sender succeeds) and reads back the count + cost over the
 * configured window to enforce the per-window total send cap, the per-recipient
 * daily cap, and the cost ceiling. Keeping the accounting in the DB (not
 * in-memory counters) makes it correct across process restarts and multiple
 * sender instances.
 *
 * The stub path never writes here — only the cost-capped live wrapper does.
 */
export const smsSendLedger = pgTable("sms_send_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** The sms_outbox row this dispatch corresponds to (nullable for safety). */
  outboxId: uuid("outbox_id"),
  /** Destination phone — the axis for the per-recipient daily cap. */
  recipient: text("recipient").notNull().default(""),
  /** When the message was dispatched — the rolling-window axis. */
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  /** Actual per-message cost in minor units (0 when the provider returns none). */
  costCents: integer("cost_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsSendLedgerRow = typeof smsSendLedger.$inferSelect;
export type SmsSendLedgerInsert = typeof smsSendLedger.$inferInsert;
