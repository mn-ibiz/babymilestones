/**
 * Parent wallet page view logic (P1-E11-S01). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The wallet page (`app/(app)/wallet/`) consumes
 * these pure functions to render the hero (balance + outstanding + read-only
 * auto-credit, AC1), the top-up method picker (AC2), the last-10 transactions
 * list (AC3), and the read-only loyalty points (AC4).
 *
 * The API (`GET /parents/me/wallet`) is the source of truth; this layer only
 * maps the integer-cents wire shape onto KES display labels at the edge.
 */
import type { RecentTransaction, WalletOverview } from "@bm/contracts";

/**
 * Format integer cents to a KES money string with thousands separators and two
 * decimals (e.g. `150050` → `"KES 1,500.50"`, `-20000` → `"KES -200.00"`).
 * Money is always integer cents — never floats — so the division here is the
 * only place a fractional value appears, and only for display.
 */
export function formatCentsKes(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toLocaleString("en-US");
  const body = `${grouped}.${String(frac).padStart(2, "0")}`;
  return `KES ${negative ? "-" : ""}${body}`;
}

/** AC1: the outstanding indicator renders only when the parent owes money (> 0). */
export function shouldShowOutstanding(outstandingCents: number): boolean {
  return outstandingCents > 0;
}

/** AC1: read-only auto-credit status label (admin flips it elsewhere). */
export function autoCreditLabel(enabled: boolean): string {
  return enabled ? "On" : "Off";
}

/** AC4: read-only loyalty points label (earn-only in P1). */
export function loyaltyLabel(points: number): string {
  return `${points} ${points === 1 ? "point" : "points"}`;
}

/** One transaction mapped onto display labels for the list row (AC3). */
export interface WalletTransactionRow {
  id: string;
  /** `YYYY-MM-DD` date the posting was made. */
  dateLabel: string;
  /** Movement classification, e.g. `topup`, `debit`, `refund`. */
  kind: string;
  /** Signed amount formatted to KES, e.g. "KES 100.00" / "KES -300.00". */
  amountLabel: string;
  /** Running balance after this posting, formatted to KES. */
  balanceAfterLabel: string;
  /** True when this posting added money (credit) — UI may tint it. */
  isCredit: boolean;
}

/** Map one posting onto its display row (date, kind, amount, balance-after). */
export function walletTransactionRow(tx: RecentTransaction): WalletTransactionRow {
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

/** Map the (already newest-first) transactions onto display rows (AC3). */
export function walletTransactionRows(
  transactions: readonly RecentTransaction[],
): WalletTransactionRow[] {
  return transactions.map(walletTransactionRow);
}

/** The wallet hero view model (AC1): balance + outstanding + auto-credit + loyalty. */
export interface WalletHeroViewModel {
  balanceLabel: string;
  showOutstanding: boolean;
  outstandingLabel: string;
  autoCreditLabel: string;
  loyaltyLabel: string;
}

/**
 * Compose the hero view model from the wallet overview (AC1). The
 * `WalletBalanceCard` renders identically to the admin Reception header by
 * reading the same balance/outstanding/auto-credit facts through this model.
 */
export function walletHeroViewModel(wallet: WalletOverview): WalletHeroViewModel {
  return {
    balanceLabel: formatCentsKes(wallet.balanceCents),
    showOutstanding: shouldShowOutstanding(wallet.outstandingCents),
    outstandingLabel: formatCentsKes(wallet.outstandingCents),
    autoCreditLabel: autoCreditLabel(wallet.autoCreditEnabled),
    loyaltyLabel: loyaltyLabel(wallet.loyaltyPoints),
  };
}

/** A top-up rail offered by the method picker (AC2). */
export interface TopUpMethod {
  key: "mpesa" | "card" | "bank";
  label: string;
  description: string;
  /** Where the picker hands off (the top-up flow, P1-E11-S03). */
  href: string;
}

/**
 * The top-up methods the picker offers (AC2): M-Pesa STK push, Paystack card,
 * and bank transfer. Selecting one hands off to the top-up flow (P1-E11-S03);
 * the M-Pesa/card rails already exist under `/top-up`.
 */
export const TOP_UP_METHODS: readonly TopUpMethod[] = [
  {
    key: "mpesa",
    label: "M-Pesa",
    description: "Get an STK prompt on your phone to approve.",
    href: "/top-up#mpesa-heading",
  },
  {
    key: "card",
    label: "Card",
    description: "Pay by Visa or Mastercard via Paystack.",
    href: "/top-up#card-heading",
  },
  {
    key: "bank",
    label: "Bank transfer",
    description: "Transfer to our bank account; we credit on confirmation.",
    href: "/top-up#bank-heading",
  },
] as const;
