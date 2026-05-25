/** @bm/wallet — recent-transactions read helper (P1-E05-S05).
 *
 *  Reception's "did this go through?" panel: the latest N `wallet_ledger`
 *  postings for one wallet, newest-first, each carrying the running balance
 *  *after* that posting. Balance is computed, never stored (consistent with
 *  P1-E03-S02): the newest row's balance-after is the full wallet balance, and
 *  each older row's balance-after is derived by peeling back the newer entries.
 *  Amounts stay integer cents — formatting to KES is a display concern. */
import type { Database, Transaction } from "@bm/db";
import { walletLedger } from "@bm/db";
import { desc, eq } from "drizzle-orm";
import { balance, type Cents } from "./index.js";

/** A drizzle handle that can read the ledger (the pooled db or a transaction). */
type LedgerReader = Database | Transaction;

/** Default cap on the recent-transactions panel (AC1: "last 10"). */
export const RECENT_TRANSACTIONS_LIMIT = 10;

/** One recent ledger posting, newest-first, with its running balance-after. */
export interface RecentTransaction {
  id: string;
  /** ISO timestamp the posting was made. */
  createdAt: string;
  /** `topup` | `debit` | `refund` | `adjustment` | `reversal`. */
  kind: string;
  /** `credit` | `debit`. */
  direction: string;
  /** Signed integer cents (credits positive, debits negative). */
  amountCents: Cents;
  /** Origin of the movement (e.g. `mpesa`, `cash:reception`, `checkin`, `admin`). */
  source: string;
  /** Running wallet balance (cents) after this posting — computed, never stored. */
  balanceAfterCents: Cents;
}

export interface RecentTransactionsOptions {
  /** Max entries to return (default {@link RECENT_TRANSACTIONS_LIMIT}). */
  limit?: number;
}

/**
 * Latest N ledger postings for a wallet, newest-first, each with the running
 * balance after it. The newest row's balance-after is the wallet's current full
 * balance ({@link balance}); each older row peels back the more-recent entry's
 * signed amount so the column stays consistent with the full ledger even though
 * only a window is returned. An empty ledger yields `[]`.
 */
export async function recentTransactions(
  db: LedgerReader,
  walletId: string,
  options: RecentTransactionsOptions = {},
): Promise<RecentTransaction[]> {
  const limit = options.limit ?? RECENT_TRANSACTIONS_LIMIT;
  if (limit <= 0) return [];

  const rows = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.walletId, walletId))
    .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
    .limit(limit);

  if (rows.length === 0) return [];

  // Newest row's balance-after = the full computed wallet balance. Walk older
  // by subtracting each more-recent entry's signed amount.
  let running = await balance(db, walletId);
  const out: RecentTransaction[] = [];
  for (const row of rows) {
    out.push({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      kind: row.kind,
      direction: row.direction,
      amountCents: row.amount,
      source: row.source,
      balanceAfterCents: running,
    });
    running -= row.amount;
  }
  return out;
}
