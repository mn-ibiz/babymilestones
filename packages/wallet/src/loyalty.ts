/** @bm/wallet — loyalty points engine (P2-E05 + P3-E04).
 *
 * P2-E05 functions use walletId + direction/points schema.
 * P3-E04 functions use parentId + pointsDelta/kind schema.
 * Both coexist on the merged loyalty_ledger table (see migration 0087).
 */
import type { Database, Transaction } from "@bm/db";
import { audit, loyaltyLedger } from "@bm/db";
import { desc, eq, sql } from "drizzle-orm";
import { splitEarnAgainstCarry } from "@bm/contracts";

type LedgerReader = Database | Transaction;

// ── P2-E05 types ─────────────────────────────────────────────────────────────

export type LoyaltyDirection = "earn" | "redeem";
export type LoyaltyEntry = typeof loyaltyLedger.$inferSelect;

export interface EarnPointsInputV2 {
  walletId: string;
  points: number;
  rateSnapshot: number;
  walletLedgerEntryId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LoyaltyTotals {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

export interface LoyaltyHistoryOptions {
  limit?: number;
  offset?: number;
}

// ── P3-E04 types ─────────────────────────────────────────────────────────────

export type Points = number;

export interface EarnPointsInput {
  db: LedgerReader;
  parentId: string;
  points: Points;
  postedBy?: string;
  earnRate?: number | null;
  earnedAmountMinor?: number | null;
  sourceWalletLedgerId?: string | null;
}

export interface EarnPointsResult {
  id: string;
  points: Points;
  appliedToNegativeCarry: Points;
  spendable: Points;
  balanceAfter: Points;
}

// ── Shared guard ──────────────────────────────────────────────────────────────

export function assertPositivePoints(points: number): void {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("loyalty points must be a positive integer");
  }
}

// ── P2-E05 functions ──────────────────────────────────────────────────────────

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

/** Idempotent earn (P2-E05-S01). Uses walletId + direction/points schema. */
export async function earnPointsV2(
  db: Database,
  input: EarnPointsInputV2,
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

/** Net loyalty balance for a wallet (P2-E05). Uses direction/points columns. */
export async function getLoyaltyBalance(db: LedgerReader, walletId: string): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'earn' THEN ${loyaltyLedger.points} ELSE -${loyaltyLedger.points} END), 0)`,
    })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.walletId, walletId));
  return Number(row?.balance ?? 0);
}

export async function getLoyaltyTotals(db: LedgerReader, walletId: string): Promise<LoyaltyTotals> {
  const [row] = await db
    .select({
      earned: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'earn' THEN ${loyaltyLedger.points} ELSE 0 END), 0)`,
      redeemed: sql<string>`COALESCE(SUM(CASE WHEN ${loyaltyLedger.direction} = 'redeem' THEN ${loyaltyLedger.points} ELSE 0 END), 0)`,
    })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.walletId, walletId));
  const lifetimeEarned = Number(row?.earned ?? 0);
  const lifetimeRedeemed = Number(row?.redeemed ?? 0);
  return { balance: lifetimeEarned - lifetimeRedeemed, lifetimeEarned, lifetimeRedeemed };
}

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

// ── P3-E04 functions ──────────────────────────────────────────────────────────

/** Net loyalty balance for a parent (P3-E04). Uses pointsDelta column. */
export async function loyaltyBalance(db: LedgerReader, parentId: string): Promise<Points> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${loyaltyLedger.pointsDelta}), 0)` })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.parentId, parentId));
  return Number(row?.total ?? 0);
}

/** Credit loyalty points to a parent (P3-E04-S02). Repays negative carry first. */
export async function earnPoints(input: EarnPointsInput): Promise<EarnPointsResult> {
  const {
    db,
    parentId,
    points,
    postedBy = "system",
    earnRate = null,
    earnedAmountMinor = null,
    sourceWalletLedgerId = null,
  } = input;
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("loyalty.earn: points must be a positive integer");
  }
  const balance = await loyaltyBalance(db, parentId);
  const { appliedToCarry, spendable } = splitEarnAgainstCarry(balance, points);
  const [row] = await db
    .insert(loyaltyLedger)
    .values({
      parentId,
      pointsDelta: points,
      kind: "earn",
      postedBy,
      earnRate: earnRate === null ? null : String(earnRate),
      earnedAmountMinor,
      sourceWalletLedgerId,
      appliedToNegativeCarry: appliedToCarry,
    })
    .returning();
  return {
    id: row!.id,
    points,
    appliedToNegativeCarry: appliedToCarry,
    spendable,
    balanceAfter: balance + points,
  };
}
