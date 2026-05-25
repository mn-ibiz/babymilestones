/**
 * Cash top-up adapter (P1-E04-S06).
 *
 * Unlike M-Pesa/Paystack — which are asynchronous, network-backed providers that
 * resolve a credit via a later callback — cash is a *manual entry*: Reception has
 * already taken the notes/coins at the counter, so the money is settled the
 * instant it is recorded. This adapter is therefore a thin, synchronous mapping
 * over the wallet's idempotent FIFO top-up primitive (`@bm/wallet.applyTopup`):
 * it credits the parent's wallet (`kind='topup'`, `source='cash:reception'`,
 * `posted_by=<staff id>`), and the same credit settles the parent's oldest
 * outstanding invoices first.
 *
 * `source='cash:reception'` is a load-bearing constant: Treasury reconciliation
 * (P1-E06) reads exactly this string to identify the cash float. Do not change it
 * without coordinating the reconciliation reader.
 *
 * The DB handle is injected so the adapter stays pure-ish and unit-testable
 * against the PGlite harness; the API route owns auth, validation, audit + SMS.
 */
import type { Database } from "@bm/db";
import { applyTopup, type ApplyTopupResult, type Cents } from "@bm/wallet";

/** The exact ledger `source` Treasury reconciliation (P1-E06) reads as cash float. */
export const CASH_RECEPTION_SOURCE = "cash:reception" as const;

/** Input to a cash top-up: who is funded, the staff actor, the amount, a dedup key. */
export interface CashTopupInput {
  /** Parent whose oldest outstanding invoices the credit settles FIFO. */
  parentId: string;
  /** Wallet that receives the credit (and any residual balance). */
  walletId: string;
  /** Positive integer cents handed over at the counter. */
  amount: Cents;
  /** Staff user id (Reception/Cashier) recording the entry — the `posted_by`. */
  postedBy: string;
  /** Caller-supplied dedup key; a replay with this key is a no-op (idempotent). */
  idempotencyKey: string;
}

/**
 * A settled cash charge. Cash never has a `pending` state (the money is already
 * in the till), so a recorded charge is always `settled`; `replayed` is true when
 * the idempotency key matched a prior recording (no second credit was posted).
 */
export interface CashCharge {
  provider: "cash";
  status: "settled";
  source: typeof CASH_RECEPTION_SOURCE;
  ledgerEntryId: string;
  /** Cents applied to outstanding invoices. */
  settled: Cents;
  /** Cents left as wallet balance after FIFO settlement. */
  residual: Cents;
  /** True when this call was an idempotent replay (no new credit posted). */
  replayed: boolean;
}

export class CashTopupAmountError extends Error {
  constructor() {
    super("cash top-up amount must be a positive integer (cents)");
    this.name = "CashTopupAmountError";
  }
}

/**
 * Record a cash top-up. Validates the amount, then credits the wallet via the
 * idempotent FIFO settlement primitive with the fixed `cash:reception` source and
 * the staff actor as `posted_by`. Returns the settled {@link CashCharge}.
 */
export async function recordCashTopup(
  db: Database,
  input: CashTopupInput,
): Promise<CashCharge> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new CashTopupAmountError();
  }

  const result: ApplyTopupResult = await applyTopup(db, {
    parentId: input.parentId,
    walletId: input.walletId,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
    source: CASH_RECEPTION_SOURCE,
    postedBy: input.postedBy,
  });

  return {
    provider: "cash",
    status: "settled",
    source: CASH_RECEPTION_SOURCE,
    ledgerEntryId: result.ledgerEntryId,
    settled: result.settled,
    residual: result.residual,
    replayed: result.replayed,
  };
}
