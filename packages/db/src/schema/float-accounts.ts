import {
  bigint,
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * `float_accounts` (P1-E06-S01) — the accounts that hold customer wallet float:
 * an M-Pesa till, a bank account, or a physical cash drawer. Admin/treasury
 * declares them so the float liability can be reconciled per account
 * (P1-E06-S02). Each wallet top-up tags its `wallet_ledger.float_account_id`
 * from the active account matching the payment method (AC3).
 *
 * Opening balance is **integer minor units (KES cents)** — `bigint`, like the
 * ledger — so there is zero float drift. `kind` is CHECK-constrained in the
 * migration to the contract enum (`mpesa_till` | `bank` | `cash_drawer`).
 */
export const floatAccounts = pgTable(
  "float_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    /** `mpesa_till` | `bank` | `cash_drawer` — CHECK-constrained in the migration. */
    kind: text("kind").notNull(),
    /** Opening balance in integer cents (KES * 100). Non-negative; defaults 0. */
    openingBalance: bigint("opening_balance", { mode: "number" }).notNull().default(0),
    /** Calendar opening date (YYYY-MM-DD). */
    openingDate: date("opening_date").notNull(),
    /** Soft on/off — inactive accounts are not picked for new top-up tagging. */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("float_accounts_kind_idx").on(t.kind),
  }),
);

export type FloatAccountRow = typeof floatAccounts.$inferSelect;
export type FloatAccountInsert = typeof floatAccounts.$inferInsert;
