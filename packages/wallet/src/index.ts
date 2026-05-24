/** @bm/wallet — ledger primitives. Schema lives in @bm/db; this package owns
 *  the domain types and constants that ride on top of the append-only
 *  wallet_ledger table (P1-E03-S01). Downstream stories (S02..S08) add the
 *  posting/balance/settlement logic here. */
import type { Database, Transaction, WalletLedgerRow } from "@bm/db";
import { walletLedger } from "@bm/db";
import { eq, inArray, sql } from "drizzle-orm";

export const PACKAGE = "@bm/wallet" as const;

/** A drizzle handle that can read the ledger (the pooled db or a transaction). */
type LedgerReader = Database | Transaction;

/** Money is integer minor units (KES cents). Never floats. */
export type Cents = number;

/** Sign of a ledger movement. Credits are positive, debits negative. */
export const LEDGER_DIRECTIONS = ["credit", "debit"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/** Business classification of a ledger movement. */
export const LEDGER_KINDS = ["topup", "debit", "refund", "adjustment", "reversal"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Re-export of the persisted ledger row shape for convenience. */
export type LedgerEntry = WalletLedgerRow;

/**
 * Wallet balance is **computed, never stored** (P1-E03-S02). It is always the
 * `SUM(amount)` over `wallet_ledger` for the wallet — credits positive, debits
 * negative — so the balance can never drift from the postings. There is no
 * `wallets.balance` column; this is the single source of truth.
 *
 * Returns integer cents (`0` when the wallet has no postings). `amount` is a
 * signed bigint stored in cents, so the SUM is exact (no float drift).
 */
export async function balance(db: LedgerReader, walletId: string): Promise<Cents> {
  const [row] = await db
    .select({
      // COALESCE so an empty ledger sums to 0, not NULL. bigint SUM comes back
      // as a string from the driver; parse to an integer Number of cents.
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(walletLedger)
    .where(eq(walletLedger.walletId, walletId));
  return Number(row?.total ?? 0);
}

/**
 * Batched balances for many wallets in one query — same SUM-from-ledger source
 * of truth as {@link balance}. Wallets with no postings are omitted from the
 * returned map (treat a missing key as a `0` balance).
 */
export async function balances(
  db: LedgerReader,
  walletIds: readonly string[],
): Promise<Map<string, Cents>> {
  if (walletIds.length === 0) return new Map();
  const rows = await db
    .select({
      walletId: walletLedger.walletId,
      total: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(walletLedger)
    .where(inArray(walletLedger.walletId, [...walletIds]))
    .groupBy(walletLedger.walletId);
  return new Map(rows.map((r) => [r.walletId, Number(r.total)]));
}
