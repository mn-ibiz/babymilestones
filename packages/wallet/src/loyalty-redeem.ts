/** @bm/wallet — loyalty redemption respects pending settlement (P3-E04-S04).
 *
 * The system must not let a parent redeem points that are about to be clawed
 * back. While a refund is *initiated but not finalised* (a rare admin workflow),
 * the proportional points are held as `pending_clawback`. The redeemable amount
 * is then `available_to_redeem = balance − Σ pending` (AC1) — the raw balance is
 * shown nowhere on the redeem surface (AC3 is satisfied by callers reading
 * {@link availableLoyaltyToRedeem} instead of `loyaltyBalance`).
 *
 * Append-only model: `markPendingClawback` (AC2) appends a NEW zero-`points_delta`
 * marker row carrying `pending_clawback = points` — the balance does not move
 * (the clawback is not finalised) but the redeemable amount drops. When the
 * refund finalises, `clawbackForRefund` posts the real negative entry AND offsets
 * the pending it provisioned (a `-points` `pending_clawback` on the finalised
 * row), so `available_to_redeem` re-aligns with the now-reduced balance and the
 * held points are never double-counted.
 */
import type { Database, Transaction } from "@bm/db";
import { loyaltyLedger } from "@bm/db";
import { and, eq, sql } from "drizzle-orm";
import { availableToRedeem } from "@bm/contracts";
import { loyaltyBalance } from "./loyalty.js";

type LedgerReader = Database | Transaction;

export interface AvailableLoyaltyToRedeem {
  /** Raw points balance — SUM(points_delta). May be negative (carry, S02). */
  balance: number;
  /** Points provisionally held against an un-finalised refund — Σ pending_clawback. */
  pendingClawback: number;
  /** What the parent may actually redeem now: max(0, balance − pendingClawback). */
  availableToRedeem: number;
}

/**
 * The points a parent may actually redeem (AC1). Reads the loyalty ledger once:
 * `balance = SUM(points_delta)` and `pendingClawback = SUM(pending_clawback)`
 * (the finalised-clawback offset rows let this net back to 0), then floors via
 * the pure {@link availableToRedeem} helper.
 */
export async function availableLoyaltyToRedeem(
  db: LedgerReader,
  parentId: string,
): Promise<AvailableLoyaltyToRedeem> {
  const [row] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${loyaltyLedger.pointsDelta}), 0)`,
      pending: sql<string>`COALESCE(SUM(${loyaltyLedger.pendingClawback}), 0)`,
    })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.parentId, parentId));

  const balance = Number(row?.balance ?? 0);
  const pendingClawback = Number(row?.pending ?? 0);
  return {
    balance,
    pendingClawback,
    availableToRedeem: availableToRedeem(balance, pendingClawback),
  };
}

export interface MarkPendingClawbackInput {
  db: LedgerReader;
  parentId: string;
  /** The earn `loyalty_ledger` row whose points are provisionally at risk. */
  earnLedgerId: string;
  /** Points to hold as pending (must be a positive integer). */
  points: number;
  /** The `wallet_ledger` refund entry that initiated this hold (idempotency key). */
  refundWalletLedgerId: string;
  /** Acting actor (admin id or `system`). */
  postedBy?: string;
}

export interface MarkPendingClawbackResult {
  /** The marker ledger row id. */
  ledgerId: string;
  /** Points now held as pending for this refund. */
  pending: number;
  /** True when a pending marker already existed for this refund (no-op replay). */
  alreadyPending: boolean;
}

/**
 * Provision a pending clawback for a refund that is initiated-but-not-finalised
 * (AC2). Appends a NEW zero-`points_delta` marker row carrying `pending_clawback`
 * — append-only, never a mutation of the earn. Idempotent on
 * `refundWalletLedgerId`: a second call for the same refund is a no-op.
 */
export async function markPendingClawback(
  input: MarkPendingClawbackInput,
): Promise<MarkPendingClawbackResult> {
  const {
    db,
    parentId,
    earnLedgerId,
    points,
    refundWalletLedgerId,
    postedBy = "system",
  } = input;

  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("markPendingClawback: points must be a positive integer");
  }

  // Idempotency: a pending marker already tied to this refund must not repeat.
  // A finalised clawback also keys on this refund (kind='clawback', non-zero
  // delta); only a prior *pending* marker (zero delta) counts as already-pending.
  const existing = await db
    .select({ id: loyaltyLedger.id, pointsDelta: loyaltyLedger.pointsDelta })
    .from(loyaltyLedger)
    .where(
      and(
        eq(loyaltyLedger.parentId, parentId),
        eq(loyaltyLedger.kind, "clawback"),
        eq(loyaltyLedger.sourceWalletLedgerId, refundWalletLedgerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { ledgerId: existing[0]!.id, pending: 0, alreadyPending: true };
  }

  const [row] = await db
    .insert(loyaltyLedger)
    .values({
      parentId,
      pointsDelta: 0, // provisional — the balance does not move until finalised
      kind: "clawback",
      postedBy,
      reversesLoyaltyLedgerId: earnLedgerId,
      sourceWalletLedgerId: refundWalletLedgerId,
      pendingClawback: points,
    })
    .returning();

  return { ledgerId: row!.id, pending: points, alreadyPending: false };
}

export { loyaltyBalance };
