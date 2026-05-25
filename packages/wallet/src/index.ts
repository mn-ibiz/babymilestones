/** @bm/wallet — ledger primitives. Schema lives in @bm/db; this package owns
 *  the domain types and constants that ride on top of the append-only
 *  wallet_ledger table (P1-E03-S01). Downstream stories (S02..S08) add the
 *  posting/balance/settlement logic here. */
import type { Database, Transaction, WalletLedgerRow } from "@bm/db";
import { floatAccounts, walletLedger } from "@bm/db";
import { floatAccountKindForPaymentMethod } from "@bm/contracts";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export const PACKAGE = "@bm/wallet" as const;

// FIFO top-up settlement (P1-E03-S04).
export { applyTopup } from "./settle.js";
export type { ApplyTopupInput, ApplyTopupResult } from "./settle.js";

// Check-in debit + invoice settlement (P1-E03-S05).
export { debit, DoubleCheckInError } from "./debit.js";
export type { DebitInput, DebitResult, DebitOutcome } from "./debit.js";

// Admin refund as a reversing ledger entry (P1-E03-S06).
export {
  refund,
  RefundReasonRequiredError,
  RefundTargetNotFoundError,
  RefundExceedsRefundableError,
} from "./refund.js";
export type { RefundInput, RefundResult } from "./refund.js";

// Wallet statement CSV generation (P1-E03-S08).
export {
  generateStatementCsv,
  formatCents,
  isAsyncRange,
  STATEMENT_COLUMNS,
  SYNC_RANGE_MAX_MONTHS,
} from "./statement.js";
export type { StatementInput, StatementRange } from "./statement.js";

// Recent-transactions panel read helper (P1-E05-S05).
export { recentTransactions, RECENT_TRANSACTIONS_LIMIT } from "./recent.js";
export type { RecentTransaction, RecentTransactionsOptions } from "./recent.js";

// Per-day-per-account reconciliation export read model (P1-E06-S04).
export { reconciliationExportRows } from "./reconciliation-export.js";

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
  /**
   * Float account this movement's cash lands in (P1-E06-S01 AC3). Optional +
   * additive — omit for movements with no float (e.g. debits) or where the
   * account is not yet resolved. Tag top-ups from the payment method via
   * {@link resolveFloatAccountId}.
   */
  floatAccountId?: string | null;
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
    floatAccountId: input.floatAccountId ?? null,
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

/**
 * Resolve the float account a top-up's cash lands in from its payment method
 * (P1-E06-S01 AC3). Maps the method → float-account kind (cash → cash_drawer,
 * M-Pesa → mpesa_till, card/bank → bank) then picks the oldest *active* account
 * of that kind. Returns null when the method is unknown or no active account of
 * that kind exists yet (the ledger column is nullable, so an untagged top-up is
 * still valid — it just will not group under an account until one is declared).
 */
export async function resolveFloatAccountId(
  db: LedgerReader,
  method: string,
): Promise<string | null> {
  const kind = floatAccountKindForPaymentMethod(method);
  if (!kind) return null;
  const [row] = await db
    .select({ id: floatAccounts.id })
    .from(floatAccounts)
    .where(and(eq(floatAccounts.kind, kind), eq(floatAccounts.active, true)))
    .orderBy(asc(floatAccounts.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * System-tracked float liability per account (P1-E06-S02 AC2). For each float
 * account the system balance is its `opening_balance` plus the `SUM(amount)` of
 * every `wallet_ledger` movement tagged to it — credits positive, debits
 * negative — so the figure is the exact customer-wallet liability the account
 * holds, computed from the ledger (never stored).
 *
 * Returns one entry per float account (active and inactive — historical drift on
 * a deactivated account must still surface), in stable opening order. Accounts
 * with no tagged movements still appear with their opening balance. Money is
 * integer cents; the bigint SUM is exact.
 */
export interface FloatLiability {
  floatAccountId: string;
  name: string;
  kind: string;
  active: boolean;
  /** System-tracked balance in cents: opening_balance + SUM(ledger.amount). */
  systemCents: Cents;
}

export async function floatLiabilities(db: LedgerReader): Promise<FloatLiability[]> {
  const rows = await db
    .select({
      id: floatAccounts.id,
      name: floatAccounts.name,
      kind: floatAccounts.kind,
      active: floatAccounts.active,
      opening: floatAccounts.openingBalance,
      // LEFT JOIN so an account with no tagged movements still returns a row;
      // COALESCE the SUM so it is 0 (not NULL) in that case. bigint SUM comes
      // back as a string from the driver.
      ledgerTotal: sql<string>`COALESCE(SUM(${walletLedger.amount}), 0)`,
    })
    .from(floatAccounts)
    .leftJoin(walletLedger, eq(walletLedger.floatAccountId, floatAccounts.id))
    .groupBy(
      floatAccounts.id,
      floatAccounts.name,
      floatAccounts.kind,
      floatAccounts.active,
      floatAccounts.openingBalance,
      floatAccounts.createdAt,
    )
    .orderBy(asc(floatAccounts.createdAt));

  return rows.map((r) => ({
    floatAccountId: r.id,
    name: r.name,
    kind: r.kind,
    active: r.active,
    systemCents: Number(r.opening) + Number(r.ledgerTotal),
  }));
}
