import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stub SMS outbox (P1-E01-S05; extended P1-E09-S01; retry P3-E06-S04). Every
 * outbound message is recorded here so the launch-time stub "delivers" by
 * persisting; tests read the row to obtain the code or inspect the rendered body.
 * The provider-agnostic adapter (`@bm/sms`) writes the row `id` as the queued id
 * and switches to a live provider via one config flag in P5-E03.
 *
 * Retry lifecycle (P3-E06-S04): a send that fails sets `status='failed'`,
 * `attempt_count++`, and `next_attempt_at` from an exponential backoff (1m, 5m,
 * 30m, 2h, 12h). The retry worker re-sends due rows; after 5 failed attempts the
 * row is dead-lettered (`status='dead_lettered'`, `dead_lettered_at` stamped) and
 * an alert is raised. `sent_at` stamps a successful (re)send.
 */
export const smsOutbox = pgTable("sms_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  /** Logical template key, e.g. "auth.reset.code". */
  template: text("template"),
  /** Template data bag that produced the rendered body (P1-E09-S01). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  /** "queued" | "sent" | "failed" | "dead_lettered" (P3-E06-S04). */
  status: text("status").notNull().default("queued"),
  /** Failed-send attempts so far (P3-E06-S04 AC1). */
  attemptCount: integer("attempt_count").notNull().default(0),
  /** Earliest time the retry worker may re-attempt (backoff gate, AC2). */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  /** Stamped once the row is dead-lettered after 5 failed attempts (AC3). */
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  /** Most recent provider error message (forensics). */
  lastError: text("last_error"),
  /** Stamped on a successful (re)send. */
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsOutboxRow = typeof smsOutbox.$inferSelect;
