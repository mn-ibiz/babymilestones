import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { wallets } from "./wallets.js";

/**
 * Append-only `wallet_ledger` (P1-E03-S01) — the immutable spine of the wallet
 * system. Every money movement is one row; rows are NEVER updated or deleted.
 *
 * Immutability is enforced at the DB level by a trigger that RAISEs on any
 * UPDATE or DELETE (see migration 0011). The acceptance criteria mention a
 * `REVOKE UPDATE, DELETE` from the `bm_app` role; in the production Postgres
 * the migration also REVOKEs, but the trigger is the portable, single-source
 * guarantee that holds even for the table owner / superuser (and under the
 * PGlite test harness, which is single-superuser so REVOKE is a no-op).
 *
 * Money is **integer minor units (KES cents)** — `bigint`, signed. Credits are
 * positive, debits negative; never floats, so there is zero rounding drift.
 */
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    /** Signed integer cents (KES * 100). Positive = credit, negative = debit. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** `credit` | `debit` — CHECK-constrained in the migration. */
    direction: text("direction").notNull(),
    /** `topup` | `debit` | `refund` | `adjustment` | `reversal` — CHECK-constrained. */
    kind: text("kind").notNull(),
    /** Caller-supplied idempotency key; UNIQUE so a retried post is a no-op. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** User id (or system actor) that posted the entry. */
    postedBy: text("posted_by").notNull(),
    /** Origin of the movement (e.g. `mpesa`, `cash`, `paystack`, `admin`). */
    source: text("source").notNull(),
    /** Self-FK: for a `reversal`, the ledger entry being reversed. Nullable. */
    reversesEntryId: uuid("reverses_entry_id").references(
      (): AnyPgColumn => walletLedger.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    walletIdIdx: index("wallet_ledger_wallet_id_idx").on(t.walletId),
    reversesEntryIdx: index("wallet_ledger_reverses_entry_id_idx").on(t.reversesEntryId),
    // P1-E03-S02: backs balance reads (SUM by wallet) and recency scans.
    walletIdCreatedAtIdx: index("wallet_ledger_wallet_id_created_at_idx").on(
      t.walletId,
      sql`${t.createdAt} DESC`,
    ),
  }),
);

export type WalletLedgerRow = typeof walletLedger.$inferSelect;
export type WalletLedgerInsert = typeof walletLedger.$inferInsert;
