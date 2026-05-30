/** @bm/wallet — loyalty points engine (P3-E04).
 *
 * The loyalty ledger is append-only, exactly like the wallet ledger: a balance
 * is `SUM(points_delta)` over the parent's rows, never stored. Points are
 * integer (no fractional points, no float drift). This module owns the earn +
 * balance primitives the rest of Epic 26 (clawback S01, negative-carry S02,
 * admin adjustment S03, redemption S04) builds on.
 *
 * NOTE: in the canonical product the earn/redeem primitives ship with the
 * P2-E05 loyalty engine; that engine is not present on this branch, so this
 * module bootstraps the minimal earn primitive the P3-E04 stories require.
 */
import type { Database, Transaction } from "@bm/db";
import { loyaltyLedger } from "@bm/db";
import { eq, sql } from "drizzle-orm";
import { splitEarnAgainstCarry } from "@bm/contracts";

type LedgerReader = Database | Transaction;

/** Points are integer. Credits positive, debits negative. */
export type Points = number;

/** Input to {@link earnPoints}. */
export interface EarnPointsInput {
  db: LedgerReader;
  parentId: string;
  /** Integer points to credit (must be > 0). */
  points: Points;
  /** Actor that posted the earn (e.g. `system`, a staff id). */
  postedBy?: string;
  /** Earn-rate snapshot (points per KES 100) for traceability. */
  earnRate?: number | null;
  /** The spent amount (minor units) the earn was computed from. */
  earnedAmountMinor?: number | null;
  /** The wallet_ledger spend that drove this earn (nullable). */
  sourceWalletLedgerId?: string | null;
}

/** Result of an earn posting. */
export interface EarnPointsResult {
  id: string;
  /** Total points credited by this entry. */
  points: Points;
  /** Portion of the earn applied to repay a pre-existing negative carry (S02). */
  appliedToNegativeCarry: Points;
  /** Spendable remainder after carry repayment (S02). */
  spendable: Points;
  /** Running balance after this entry. */
  balanceAfter: Points;
}

/**
 * The parent's loyalty balance — `SUM(points_delta)`, computed never stored.
 * Returns 0 for a parent with no entries. May be negative (honest negative
 * carry after a clawback, S01 AC4).
 */
export async function loyaltyBalance(db: LedgerReader, parentId: string): Promise<Points> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${loyaltyLedger.pointsDelta}), 0)` })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.parentId, parentId));
  return Number(row?.total ?? 0);
}

/**
 * Credit loyalty points to a parent (P3-E04-S02). If the parent's balance is
 * negative (a prior clawback overshot the balance), the earn repays the carry
 * FIRST — `applied_to_negative_carry` records that portion — and only the
 * remainder is spendable. The single ledger row still credits the full
 * `points`, so the balance recovers; the split is recorded for traceability.
 */
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
