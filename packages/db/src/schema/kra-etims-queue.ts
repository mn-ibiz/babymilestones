import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `kra_etims_queue` (P5-E02-S02) — durable retry / dead-letter queue for eTIMS
 * submissions. When KRA is unreachable the receipt submission is queued here and
 * the jobs runner retries it with exponential backoff; a row that exhausts
 * `max_attempts` is dead-lettered (the alert) for manual inspection / requeue.
 *
 * `payload` stores the full {@link WriteReceiptPayload} so a retry re-attempts
 * standalone; `idempotency_key` (= `<series>-<sequence>`) is UNIQUE so a receipt
 * is enqueued at most once and a retry never double-registers a KRA invoice.
 */
export const kraEtimsQueue = pgTable(
  "kra_etims_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable per-receipt key (`<series>-<sequence>`); UNIQUE — one row per receipt. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    series: text("series").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    /** The full receipt payload to re-submit. */
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    /** `pending` (due for retry) | `sent` (accepted by KRA) | `dead_letter` (exhausted). */
    status: text("status").notNull().default("pending").$type<EtimsQueueStatus>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(10),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dueIdx: index("kra_etims_queue_due_idx").on(t.status, t.nextAttemptAt),
  }),
);

/** eTIMS queue row status. */
export type EtimsQueueStatus = "pending" | "sent" | "dead_letter";

export type KraEtimsQueueRow = typeof kraEtimsQueue.$inferSelect;
export type KraEtimsQueueInsert = typeof kraEtimsQueue.$inferInsert;
