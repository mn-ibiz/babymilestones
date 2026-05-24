/** @bm/wallet — ledger primitives. Schema lives in @bm/db; this package owns
 *  the domain types and constants that ride on top of the append-only
 *  wallet_ledger table (P1-E03-S01). Downstream stories (S02..S08) add the
 *  posting/balance/settlement logic here. */
import type { WalletLedgerRow } from "@bm/db";

export const PACKAGE = "@bm/wallet" as const;

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
