import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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

/**
 * Paystack webhook event (P1-E04-S05). One row per event Paystack delivers.
 *
 * Keyed by the Paystack `data.id` (the stable per-event id) as the PRIMARY KEY
 * → UNIQUE, so a replayed/re-delivered webhook collapses to a single row via
 * `ON CONFLICT DO NOTHING` — the authoritative replay guard. The wallet credit
 * (`@bm/wallet.post`) is keyed off this same id so a racing re-delivery cannot
 * double-credit (the ledger `idempotency_key` UNIQUE is the second layer).
 *
 * The HMAC-SHA512 signature is verified over the RAW request body in the API
 * layer BEFORE this insert: an invalid signature is rejected (401) with zero
 * writes, so only cryptographically-trusted events ever land here. The Paystack
 * secret key lives in env only — never in this table.
 */
export const paystackEvents = pgTable(
  "paystack_event",
  {
    /** The Paystack event id (`data.id`). PRIMARY KEY → UNIQUE; replay = no-op. */
    id: text("id").primaryKey(),
    /** Event type, e.g. `charge.success`. Drives routing + forensics. */
    event: text("event").notNull(),
    /** Client `reference` we generated (echoed by Paystack); resolves the txn row. */
    reference: text("reference"),
    /** Full verified webhook payload, stored verbatim for forensics/replay. */
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    referenceIdx: index("paystack_event_reference_idx").on(t.reference),
  }),
);

export type PaystackEventRow = typeof paystackEvents.$inferSelect;
export type PaystackEventInsert = typeof paystackEvents.$inferInsert;
