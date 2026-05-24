import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** One wallet per user, auto-provisioned at signup (P1-E01-S01 AC1). The
 *  append-only wallet_ledger that references it lands in P1-E03. */
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  // P1-E03-S05: when true, an underfunded check-in debits anyway (balance may go
  // negative) and the invoice settles `settled_on_credit`; when false (default)
  // the invoice is left `outstanding`. The per-parent toggle UI is P1-E03-S07.
  autoCreditEnabled: boolean("auto_credit_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WalletRow = typeof wallets.$inferSelect;
