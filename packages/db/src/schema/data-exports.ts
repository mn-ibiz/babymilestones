import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Parent data-portability exports (P1-E02-S05, Kenya Data Protection Act right
 * of access). One row per "export my data" request. Lifecycle:
 *   pending → (async job gathers + bundles ZIP, stores it) → ready
 *           → (parent downloads once within 7 days)        → consumed
 * The `downloadToken` is opaque and single-use; `expiresAt` bounds it to 7 days.
 */
export const dataExports = pgTable(
  "data_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** pending | ready | failed */
    status: text("status").notNull().default("pending"),
    /** Single-use, unguessable download token (set when the job completes). */
    downloadToken: text("download_token").unique(),
    /** Object key at the signed-URL S3-equivalent store. */
    storageKey: text("storage_key"),
    /** Token validity window — 7 days from completion (AC2). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Stamped the first (and only) time the token is redeemed (AC2 single-use). */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("data_exports_user_id_idx").on(t.userId),
    tokenIdx: index("data_exports_download_token_idx").on(t.downloadToken),
  }),
);

export type DataExportRow = typeof dataExports.$inferSelect;
