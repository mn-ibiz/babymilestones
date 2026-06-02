import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `woo_config` (P4-E04-S06 / Story 29.6) — the single WooCommerce REST API
 * connection an admin registers from the Settings "WooCommerce" panel so all
 * sync work (S07+) talks to one configured surface.
 *
 * Secret hygiene (AC3): unlike `sms_config` (which stores only an env-var ref),
 * the WooCommerce consumer key + secret are stored ENCRYPTED AT REST here —
 * `consumer_key_enc` / `consumer_secret_enc` hold the AES-256-GCM `v1:...`
 * envelope produced by `@bm/woocommerce` `encryptSecret`. The plaintext is
 * accepted on save only and is NEVER returned to the client (write-only field);
 * reads go through a secret-free projection.
 *
 * Single-row config (AC3): there is at most one WooCommerce connection, enforced
 * by a partial unique index over a constant (mirrors `sms_config_single_active_idx`).
 * `site_url` is validated HTTPS at the edge (`@bm/contracts` + the API route).
 */
export const wooConfig = pgTable("woo_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Store site URL — HTTPS enforced at the edge. Not a secret. */
  siteUrl: text("site_url").notNull(),
  /** AES-256-GCM ciphertext of the consumer key (`v1:...`), or null when unset. */
  consumerKeyEnc: text("consumer_key_enc"),
  /** AES-256-GCM ciphertext of the consumer secret (`v1:...`), or null when unset. */
  consumerSecretEnc: text("consumer_secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// AC3: a single WooCommerce connection. The singleton is enforced at the DB
// level by a partial unique index over a constant (migration 0091) — every row
// collides on the same key, so a second row is rejected. The index needs no
// column reference, so it is owned by the migration rather than declared here.

export type WooConfigRow = typeof wooConfig.$inferSelect;
export type WooConfigInsert = typeof wooConfig.$inferInsert;
