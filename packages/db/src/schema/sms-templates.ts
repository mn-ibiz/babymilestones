import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * `sms_templates` (P1-E09-S03) — the registry of SMS message copy, addressed by
 * a logical `key` and versioned. Each row's `body` carries `{placeholder}`
 * tokens that the `@bm/sms` resolver interpolates from the send `data` bag at
 * send time, so product code references a template by key and never an inline
 * string (AC1/AC2).
 *
 * Versioning (AC1): a `(key, language)` may have many rows across `version`s;
 * exactly one is `is_active` (partial unique index, migration 0036). A copy
 * change ships as a NEW row + an active flip, leaving prior versions on record.
 *
 * Read-only in P1 (admin view, AC3); the schema (`version`, `is_active`) is
 * built now so P2 can add editing without a migration.
 */
export const smsTemplates = pgTable(
  "sms_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Logical template key, e.g. "topup.success". */
    key: text("key").notNull(),
    /** BCP-47-ish language tag; launch ships "en" only. */
    language: text("language").notNull().default("en"),
    /** Monotonic version per (key, language); a new copy revision = a new row. */
    version: integer("version").notNull().default(1),
    /** Body with {placeholder} tokens interpolated from the send data bag. */
    body: text("body").notNull(),
    /** Exactly one active row per (key, language). */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // AC1: at most one active template per (key, language).
    activeKeyLang: uniqueIndex("sms_templates_active_key_lang_idx")
      .on(t.key, t.language)
      .where(sql`${t.isActive} = true`),
    // Version history is well-formed: no two rows share a (key, language, version).
    keyLangVersion: uniqueIndex("sms_templates_key_lang_version_idx").on(
      t.key,
      t.language,
      t.version,
    ),
  }),
);

export type SmsTemplateRow = typeof smsTemplates.$inferSelect;
export type SmsTemplateInsert = typeof smsTemplates.$inferInsert;
