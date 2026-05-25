import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * `sms_config` (P1-E09-S02) — the SMS provider connection settings an admin
 * registers once a sender ID is approved, so the provider can be activated
 * without a code change.
 *
 * Secret hygiene (AC1/AC2): the API key is NEVER stored here. We store only
 * `api_key_ref` — the NAME of the environment variable / secret reference that
 * holds the literal key at runtime. Reads and audit payloads expose the ref,
 * never a secret value.
 *
 * Single-active invariant (AC4): at most one row may have `is_active = true`,
 * enforced by a partial unique index (migration 0035). The application activates
 * a row by clearing the previous active row in the same transaction.
 *
 * `api_url` is validated HTTPS + non-SSRF at the edge (AC3, `@bm/sms`
 * `checkProviderUrlSafety`); the column is plain text — the URL is not a secret.
 */
export const smsConfig = pgTable(
  "sms_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Registered alphanumeric / short-code sender ID shown to recipients. */
    senderId: text("sender_id").notNull(),
    /** Provider send endpoint — HTTPS, public host only (validated at the edge). */
    apiUrl: text("api_url").notNull(),
    /** Env-var NAME holding the API key (e.g. "SMS_API_KEY") — never the key. */
    apiKeyRef: text("api_key_ref").notNull(),
    /** At most one row may be true (partial unique index in the migration). */
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // AC4: only one active row. Partial unique index over a constant — every
    // active row collides on the same key, so the second insert/update fails.
    singleActive: uniqueIndex("sms_config_single_active_idx")
      .on(sql`(true)`)
      .where(sql`${t.isActive} = true`),
  }),
);

export type SmsConfigRow = typeof smsConfig.$inferSelect;
export type SmsConfigInsert = typeof smsConfig.$inferInsert;
