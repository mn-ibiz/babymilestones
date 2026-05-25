/**
 * Reception recent-transactions panel view logic (P1-E05-S05). Framework-agnostic
 * + dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The `<RecentTransactionsPanel>` rendered below the
 * `<ParentHeader>` consumes this to format the latest 10 ledger postings — date,
 * kind, amount, balance-after (AC1) — newest-first, plus the "View full
 * statement" link target (AC2 → reuses the P1-E03-S08 export).
 *
 * The server (`GET /reception/parents/:userId/recent-transactions`) is the
 * source of truth; this only maps each posting onto display labels. Amounts
 * arrive as integer cents and are formatted to KES here at the edge.
 */
import type { RecentTransaction } from "@bm/contracts";
import { formatCentsKes } from "./parent-search";

/** A single recent posting, mapped onto display labels for the panel row. */
export interface RecentTransactionRow {
  id: string;
  /** `YYYY-MM-DD` date the posting was made. */
  dateLabel: string;
  /** Movement classification, e.g. `topup`, `debit`, `refund`. */
  kind: string;
  /** Signed amount formatted to KES, e.g. "KES 10.00" / "KES -200.00". */
  amountLabel: string;
  /** Running balance after this posting, formatted to KES. */
  balanceAfterLabel: string;
  /** True when this posting added money (credit) — UI may tint it. */
  isCredit: boolean;
}

/** Map one posting onto its display row (date, kind, amount, balance-after). */
export function recentTransactionRow(tx: RecentTransaction): RecentTransactionRow {
  const d = new Date(tx.createdAt);
  const dateLabel = Number.isNaN(d.getTime()) ? tx.createdAt : d.toISOString().slice(0, 10);
  return {
    id: tx.id,
    dateLabel,
    kind: tx.kind,
    amountLabel: formatCentsKes(tx.amountCents),
    balanceAfterLabel: formatCentsKes(tx.balanceAfterCents),
    isCredit: tx.direction === "credit",
  };
}

/** Map the panel's transactions (already newest-first) onto display rows (AC1). */
export function recentTransactionsViewModel(
  transactions: readonly RecentTransaction[],
): RecentTransactionRow[] {
  return transactions.map(recentTransactionRow);
}

/**
 * The "View full statement" link target (AC2): the parent's wallet statement
 * export surface (P1-E03-S08), reused rather than re-implemented. The export
 * route owns its own date-range picker, so the link just opens it for the parent.
 */
export function fullStatementHref(userId: string): string {
  return `/parents/${userId}/statement`;
}
