import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stub SMS outbox (P1-E01-S05; extended P1-E09-S01; retry P3-E06-S04; live
 * dispatch P5-E03). Every outbound message is recorded here so the launch-time
 * stub "delivers" by persisting; tests read the row to obtain the code or inspect
 * the rendered body. The provider-agnostic adapter (`@bm/sms`) writes the row
 * `id` as the queued id and switches to a live provider via one config flag
 * (P5-E03-S02).
 *
 * Retry lifecycle (P3-E06-S04, migration 0077): a send that fails sets
 * `status='failed'`, `attempt_count++`, and `next_attempt_at` from an exponential
 * backoff (1m, 5m, 30m, 2h, 12h). The retry worker re-sends due rows; after 5
 * failed attempts the row is dead-lettered (`status='dead_lettered'`,
 * `dead_lettered_at` stamped) and an alert is raised. `sent_at` stamps a
 * successful (re)send.
 *
 * Live-dispatch columns (P5-E03, migration 0074) record the live-provider
 * outcome: which adapter sent it, the provider's message id, per-message cost
 * (for the spend caps in 33.3), error text (so a failed send is never silently
 * dropped), the dispatch time, and a `deferred_until` watermark for a message the
 * cap held over to the next window.
 */
export const smsOutbox = pgTable("sms_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  /** Logical template key, e.g. "auth.reset.code". */
  template: text("template"),
  /** Template data bag that produced the rendered body (P1-E09-S01). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  /** "queued" | "sent" | "failed" | "dead_lettered" (P3-E06-S04) | "deferred" (P5-E03). */
  status: text("status").notNull().default("queued"),
  /** Failed-send attempts so far (P3-E06-S04 AC1). */
  attemptCount: integer("attempt_count").notNull().default(0),
  /** Earliest time the retry worker may re-attempt (backoff gate, AC2). */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  /** Stamped once the row is dead-lettered after 5 failed attempts (AC3). */
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  /** Most recent provider error message (forensics, P3-E06-S04). */
  lastError: text("last_error"),
  /** Which adapter dispatched: "stub" | "live" (null until dispatched, P5-E03). */
  provider: text("provider"),
  /** Provider message id from a successful live send (P5-E03 AC3). */
  providerMessageId: text("provider_message_id"),
  /** Per-message cost in minor units (cents) — feeds the spend caps (33.3). */
  costCents: integer("cost_cents"),
  /** Provider error text on a failed live send — never silently dropped. */
  error: text("error"),
  /** When a live dispatch completed (sent or failed, P5-E03). */
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  /** When a capped/deferred message becomes eligible again (33.3). */
  deferredUntil: timestamp("deferred_until", { withTimezone: true }),
  /** Stamped on a successful (re)send. */
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsOutboxRow = typeof smsOutbox.$inferSelect;
