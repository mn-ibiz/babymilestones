import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `settings` (P1-E10-S04) — a generic key/value app-settings store backing the
 * admin Settings sub-app's "general" sections: loyalty rates, branding
 * (logo/colours), and receipt branding. Sections that already own a dedicated
 * table (SMS provider config, float accounts) are NOT stored here — the Settings
 * area merely links to them.
 *
 * One row per setting key. `value` is an arbitrary JSON document so a section's
 * shape can evolve without a migration; payloads are validated at the API edge
 * with `@bm/contracts` Zod schemas before they land here. Every write is audited
 * to `audit_outbox` (AC3) and stamps `updated_by` with the acting admin.
 */
export const settings = pgTable("settings", {
  /** Stable section key, e.g. "loyalty", "branding", "receipt_branding". */
  key: text("key").primaryKey(),
  /** Section payload as a JSON document. */
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  /** The admin who last wrote this setting (nullable for system seeds). */
  updatedBy: uuid("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type SettingsInsert = typeof settings.$inferInsert;
