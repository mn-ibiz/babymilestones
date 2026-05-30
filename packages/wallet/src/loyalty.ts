/** @bm/wallet — loyalty points engine (P2-E05). Rides on the append-only
 *  `loyalty_ledger` table (schema in @bm/db). Earn rows are written for settled
 *  payments and reference the wallet_ledger entry that triggered them; the
 *  earn/redeem rate is snapshotted so historical points survive rate changes.
 *  Balance is derived from the ledger (never a stored column). */
import type { Database, Transaction } from "@bm/db";
import { audit, loyaltyLedger } from "@bm/db";
import { desc, eq, sql } from "drizzle-orm";

/** A drizzle handle that can read the ledger (the pooled db or a transaction). */
type LedgerReader = Database | Transaction;

export type LoyaltyDirection = "earn" | "redeem";

/** Re-export of the persisted row shape for convenience. */
export type LoyaltyEntry = typeof loyaltyLedger.$inferSelect;

/**
 * Guard: loyalty points are always a strictly-positive integer. Throws BEFORE
 * any write so a bad amount can never reach the ledger.
 */
export function assertPositivePoints(points: number): void {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("loyalty points must be a positive integer");
  }
}

export interface EarnPointsInput {
  walletId: string;
  /** Strictly-positive integer points to credit. */
  points: number;
  /** Earn rate (KES per point) in force now — snapshotted onto the row (AC3). */
  rateSnapshot: number;
  /** The wallet_ledger entry that triggered this earn (AC2). */
  walletLedgerEntryId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  /** Dedup key; a retried earn with this key is a no-op (no double-credit). */
  idempotencyKey: string;
  /** Acting user id (UUID) for the audit row, or null for system. */
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

async function findByIdempotencyKey(
  tx: LedgerReader,
  idempotencyKey: string,
): Promise<LoyaltyEntry | undefined> {
  const [row] = await tx
    .select()
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  return row;
}

/**
 * Insert an append-only `earn` row idempotently (P2-E05-S01). Re-invoking with
 * the same `idempotencyKey` returns the existing row and does NOT double-credit.
 * Audits `loyalty.earn`. Runs inside one transaction; the UNIQUE constraint on
 * `idempotency_key` is the durable backstop against concurrent double-earn.
 */
export async function earnPoints(
  db: Database,
  input: EarnPointsInput,
): Promise<LoyaltyEntry> {
  assertPositivePoints(input.points);
  if (!Number.isInteger(input.rateSnapshot) || input.rateSnapshot <= 0) {
    throw new Error("rateSnapshot must be a positive integer");
  }

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (existing) return existing;

    const [row] = await tx
      .insert(loyaltyLedger)
      .values({
        walletId: input.walletId,
        direction: "earn",
        points: input.points,
        rateSnapshot: input.rateSnapshot,
        walletLedgerEntryId: input.walletLedgerEntryId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      })
      .returning();

    await audit(tx, {
      actor: input.actor ?? null,
      action: "loyalty.earn",
      target: { table: "loyalty_ledger", id: row!.id },
      payload: {
        wallet_id: input.walletId,
        points: input.points,
        rate_snapshot: input.rateSnapshot,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
      },
    });

    return row!;
  });
}

/**
 * Net loyalty balance = SUM(earn.points) - SUM(redeem.points), derived from the
 * append-only ledger. Never read from a mutable cached column. Returns 0 for an
 * empty wallet. Accepts a tx so a redemption can re-check balance atomically.
 */
export async function getLoyaltyBalance(
  db: LedgerReader,
  walletId: string,
): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'earn' THEN ${loyaltyLedger.points} ELSE -${loyaltyLedger.points} END), 0)`,
    })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.walletId, walletId));
  return Number(row?.balance ?? 0);
}

/** Lifetime totals for the parent dashboard (P2-E05-S04 AC1). */
export interface LoyaltyTotals {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

export async function getLoyaltyTotals(
  db: LedgerReader,
  walletId: string,
): Promise<LoyaltyTotals> {
  const [row] = await db
    .select({
      earned: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'earn' THEN ${loyaltyLedger.points} ELSE 0 END), 0)`,
      redeemed: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'redeem' THEN ${loyaltyLedger.points} ELSE 0 END), 0)`,
    })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.walletId, walletId));
  const lifetimeEarned = Number(row?.earned ?? 0);
  const lifetimeRedeemed = Number(row?.redeemed ?? 0);
  return {
    balance: lifetimeEarned - lifetimeRedeemed,
    lifetimeEarned,
    lifetimeRedeemed,
  };
}

export interface LoyaltyHistoryOptions {
  limit?: number;
  offset?: number;
}

/**
 * Ledger rows for a wallet, newest-first (by `seq`), paginated. Read-only.
 */
export async function getLoyaltyHistory(
  db: LedgerReader,
  walletId: string,
  opts: LoyaltyHistoryOptions = {},
): Promise<LoyaltyEntry[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  return db
    .select()
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.walletId, walletId))
    .orderBy(desc(loyaltyLedger.seq))
    .limit(limit)
    .offset(offset);
}
