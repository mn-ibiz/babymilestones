import { bigint, boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { wallets } from "./wallets.js";

/**
 * Paystack hosted-checkout transaction (P1-E04-S04). One row per card top-up the
 * platform initiates on a parent's behalf. Provider table — prefixed `paystack_*`.
 *
 * Keyed by `reference` (UNIQUE): a UUID we generate, echoed by Paystack on
 * `transaction/verify` (this story) and on the `charge.success` webhook
 * (P1-E04-S05), so both resolve exactly one row idempotently. Money is integer
 * minor units (KES cents), bigint, positive.
 *
 * State machine for THIS story: `INITIALIZED → SUCCEEDED | FAILED | ABANDONED`
 * (set on the redirect-back verify, UX confirmation only). The webhook (S05)
 * remains the source of truth for crediting the wallet via `@bm/wallet`. The
 * Paystack secret key lives in env only — never here. Card-on-file (AC4) stores
 * the saved `authorizationCode` once a reusable card is confirmed.
 */
export const paystackTransactions = pgTable(
  "paystack_transaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Client reference (UUID) we generate — durable handle echoed on verify/webhook. UNIQUE. */
    reference: text("reference").notNull().unique(),
    /** Initiating parent (users.id) — the session owner, never client-supplied. */
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id),
    /** Wallet the eventual credit (S05) lands in. Derived server-side. */
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    /** Amount requested, integer minor units (KES cents). Positive. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Payer email passed to Paystack (the parent's profile email). */
    email: text("email").notNull(),
    /** AC4: whether the parent opted to save the card authorization for repeat top-ups. */
    saveCard: boolean("save_card").notNull().default(false),
    /** Paystack saved authorization token (card-on-file), captured on a successful verify. */
    authorizationCode: text("authorization_code"),
    /**
     * `INITIALIZED` | `SUCCEEDED` | `FAILED` | `ABANDONED` — CHECK-constrained in
     * the migration. This story writes INITIALIZED then advances on verify; the
     * webhook (S05) is the authoritative crediting path.
     */
    state: text("state").notNull().default("INITIALIZED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdCreatedAtIdx: index("paystack_transaction_parent_id_created_at_idx").on(
      t.parentId,
      t.createdAt,
    ),
  }),
);

export type PaystackTransactionRow = typeof paystackTransactions.$inferSelect;
export type PaystackTransactionInsert = typeof paystackTransactions.$inferInsert;
