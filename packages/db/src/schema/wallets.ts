import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** One wallet per user, auto-provisioned at signup (P1-E01-S01 AC1). The
 *  append-only wallet_ledger that references it lands in P1-E03. */
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WalletRow = typeof wallets.$inferSelect;
