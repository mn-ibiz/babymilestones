/** @bm/wallet — ledger primitives. Schema lives in @bm/db; this package owns
 *  the domain types and constants that ride on top of the append-only
 *  wallet_ledger table (P1-E03-S01). Downstream stories (S02..S08) add the
 *  posting/balance/settlement logic here. */
import type { Database, Transaction, WalletLedgerRow } from "@bm/db";
import { walletLedger } from "@bm/db";
import { eq, inArray, sql } from "drizzle-orm";

export const PACKAGE = "@bm/wallet" as const;

// FIFO top-up settlement (P1-E03-S04).
export { applyTopup } from "./settle.js";
export type { ApplyTopupInput, ApplyTopupResult } from "./settle.js";

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
 * Input to {@link post}. `direction` is derived from the sign of `amount`
 * (credits positive, debits negative), so callers never pass it explicitly.
 */
export interface PostInput {
  walletId: string;
  /** Signed integer cents. Positive = credit, negative = debit. */
  amount: Cents;
  kind: LedgerKind;
  /** Caller-supplied dedup key; a retried post with this key is a no-op. */
  idempotencyKey: string;
  /** Origin of the movement (e.g. `mpesa`, `cash`, `paystack`, `admin`). */
  source: string;
  /** User id (or system actor) that posted the entry. */
  postedBy: string;
}

/**
 * Thrown when a post reuses an existing `idempotencyKey` but with a *different*
 * payload — a genuine semantic conflict the caller must resolve (it is NOT a
 * benign retry). Carries the offending key and the row that already exists so
 * the caller can decide how to reconcile.
 */
export class IdempotencyConflict extends Error {
  readonly idempotencyKey: string;
  readonly existing: WalletLedgerRow;
  constructor(idempotencyKey: string, existing: WalletLedgerRow) {
    super(
      `wallet.post: idempotency key "${idempotencyKey}" was already used with a different payload`,
    );
    this.name = "IdempotencyConflict";
    this.idempotencyKey = idempotencyKey;
    this.existing = existing;
  }
}

/**
 * Post a single money movement to the append-only `wallet_ledger` (P1-E03-S03).
 *
 * Idempotency is arbitrated by the `idempotency_key` UNIQUE index (P1-E03-S01),
 * NOT by application-level locking. The insert runs inside a transaction with
 * `ON CONFLICT (idempotency_key) DO NOTHING`; the database serialises racing
 * inserts so at most one row is ever written for a given key. Behaviour:
 *
 * - **New key** → inserts one row and returns it.
 * - **Same key, same payload** → returns the pre-existing row (no second insert),
 *   making a retried post a safe no-op.
 * - **Same key, different payload** → throws {@link IdempotencyConflict}.
 *
 * This is the safe entry point for retryable callers (M-Pesa/Paystack webhooks).
 */
export async function post(db: Database, input: PostInput): Promise<WalletLedgerRow> {
  const direction: LedgerDirection = input.amount >= 0 ? "credit" : "debit";
  const values = {
    walletId: input.walletId,
    amount: input.amount,
    direction,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    source: input.source,
    postedBy: input.postedBy,
  };

  return db.transaction(async (tx) => {
    // The UNIQUE index on idempotency_key arbitrates concurrent races: at most
    // one INSERT wins; the rest hit the conflict and write nothing.
    const inserted = await tx
      .insert(walletLedger)
      .values(values)
      .onConflictDoNothing({ target: walletLedger.idempotencyKey })
      .returning();

    if (inserted[0]) return inserted[0];

    // Conflict: a row already exists for this key. Fetch it and decide whether
    // this is a benign retry (same payload → return it) or a true semantic
    // conflict (different payload → surface a typed error).
    const [existing] = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, input.idempotencyKey));

    // Defensive: the row must exist (the conflict implies it), but guard anyway.
    if (!existing) {
      throw new Error(
        `wallet.post: conflict on idempotency key "${input.idempotencyKey}" but no existing row found`,
      );
    }

    if (
      existing.walletId !== values.walletId ||
      existing.amount !== values.amount ||
      existing.direction !== values.direction ||
      existing.kind !== values.kind ||
      existing.source !== values.source ||
      existing.postedBy !== values.postedBy
    ) {
      throw new IdempotencyConflict(input.idempotencyKey, existing);
    }

    return existing;
  });
}

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
