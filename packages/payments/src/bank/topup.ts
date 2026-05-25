/**
 * Bank transfer top-up adapter (P1-E04-S07).
 *
 * Unlike M-Pesa/Paystack — asynchronous, network-backed providers — a bank
 * transfer is a *manual entry*: an admin records a transfer they observed, then
 * (after matching it to a parent) confirms it. Confirmation is what credits the
 * wallet. This adapter is therefore a thin, synchronous mapping over the wallet's
 * idempotent FIFO top-up primitive (`@bm/wallet.applyTopup`): it credits the
 * parent's wallet (`kind='topup'`, `source='bank:manual'`, `posted_by=<admin id>`)
 * and settles the parent's oldest outstanding invoices first.
 *
 * `source='bank:manual'` is a load-bearing constant: Treasury reconciliation
 * (P1-E06) reads exactly this string to identify a manual bank credit. Do not
 * change it without coordinating the reconciliation reader.
 *
 * The wallet idempotency key is the `bank_transfer_pending.id` — a double-confirm
 * of the same row reuses the key and posts NO second credit (the ledger
 * `idempotency_key` UNIQUE is the authoritative guard).
 *
 * The DB handle is injected so the adapter stays unit-testable against the PGlite
 * harness; the API route owns auth, validation, status transition, audit + SMS.
 */
import type { Database } from "@bm/db";
import { applyTopup, type ApplyTopupResult, type Cents } from "@bm/wallet";

/** The exact ledger `source` Treasury reconciliation (P1-E06) reads as a manual bank credit. */
export const BANK_MANUAL_SOURCE = "bank:manual" as const;

/** Input to confirming a recorded bank transfer. */
export interface BankTransferConfirmInput {
  /** The `bank_transfer_pending.id` — also the wallet idempotency key. */
  pendingId: string;
  /** Parent whose oldest outstanding invoices the credit settles FIFO. */
  parentId: string;
  /** Wallet that receives the credit (and any residual balance). */
  walletId: string;
  /** Positive integer cents recorded on the transfer. */
  amount: Cents;
  /** Admin/treasury user id confirming the transfer — the `posted_by`. */
  postedBy: string;
}

/**
 * A confirmed bank charge. A bank transfer is settled the instant it is
 * confirmed (the money has already arrived), so a confirmed charge is always
 * `settled`; `replayed` is true when the pending id matched a prior confirmation
 * (no second credit was posted — the double-confirm guard).
 */
export interface BankCharge {
  provider: "bank";
  status: "settled";
  source: typeof BANK_MANUAL_SOURCE;
  ledgerEntryId: string;
  /** Cents applied to outstanding invoices. */
  settled: Cents;
  /** Cents left as wallet balance after FIFO settlement. */
  residual: Cents;
  /** True when this call was an idempotent replay (no new credit posted). */
  replayed: boolean;
}

export class BankTransferAmountError extends Error {
  constructor() {
    super("bank transfer amount must be a positive integer (cents)");
    this.name = "BankTransferAmountError";
  }
}

/**
 * Confirm a recorded bank transfer. Validates the amount, then credits the wallet
 * via the idempotent FIFO settlement primitive with the fixed `bank:manual`
 * source and the admin actor as `posted_by`, keyed on the pending row id so a
 * re-confirm is a no-op. Returns the settled {@link BankCharge}.
 */
export async function confirmBankTransfer(
  db: Database,
  input: BankTransferConfirmInput,
): Promise<BankCharge> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new BankTransferAmountError();
  }

  const result: ApplyTopupResult = await applyTopup(db, {
    parentId: input.parentId,
    walletId: input.walletId,
    amount: input.amount,
    idempotencyKey: input.pendingId,
    source: BANK_MANUAL_SOURCE,
    postedBy: input.postedBy,
  });

  return {
    provider: "bank",
    status: "settled",
    source: BANK_MANUAL_SOURCE,
    ledgerEntryId: result.ledgerEntryId,
    settled: result.settled,
    residual: result.residual,
    replayed: result.replayed,
  };
}
