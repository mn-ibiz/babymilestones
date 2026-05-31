/** @bm/wallet — proportional loyalty clawback on refund (P3-E04-S01).
 *
 * When a spend that earned loyalty points is refunded, claw back the
 * proportional number of points as a NEW reversing `loyalty_ledger` row
 * (`kind='clawback'`, `points_delta` negative). The original earn is NEVER
 * mutated — the ledger is append-only — and the clawback references it via
 * `reverses_loyalty_ledger_id` (AC2) and the triggering refund via
 * `source_wallet_ledger_id`.
 *
 * If the parent's balance is sufficient the clawback is a straightforward debit
 * (AC3); if not, the balance goes negative and the row is flagged
 * `negative_carry=true` (AC4) — future earns repay that carry first (S02).
 *
 * Idempotent on refund replay: a clawback already tied to the same refund is
 * never written twice.
 */
import type { Database, Transaction } from "@bm/db";
import { loyaltyLedger } from "@bm/db";
import { and, eq } from "drizzle-orm";
import { loyaltyClawbackPoints } from "@bm/contracts";
import { loyaltyBalance } from "./loyalty.js";

type LedgerReader = Database | Transaction;

export interface ClawbackForRefundInput {
  db: LedgerReader;
  parentId: string;
  /** The earn `loyalty_ledger` row being (partly) reversed. */
  earnLedgerId: string;
  /** Points originally earned on the refunded spend. */
  earnedPoints: number;
  /** Refunded amount and original amount, both in minor units. */
  refundedMinor: number;
  originalMinor: number;
  /** The `wallet_ledger` refund entry that triggered this clawback (idempotency key). */
  refundWalletLedgerId: string;
  /** Acting actor (admin id or `system`). */
  postedBy?: string;
}

export interface ClawbackForRefundResult {
  /** The clawback ledger row id, or null when nothing was clawed back. */
  ledgerId: string | null;
  /** Points actually clawed back (0 on a replay or zero-proportion). */
  clawedBack: number;
  /** True when a clawback already existed for this refund (no-op replay). */
  alreadyClawedBack: boolean;
  /** True when the clawback drove the balance below zero (AC4). */
  negativeCarry: boolean;
  /** Running balance after the clawback. */
  balanceAfter: number;
}

/**
 * Claw back loyalty points proportional to a refund as a reversing entry.
 * See the module doc for the append-only / negative-carry / idempotency rules.
 */
export async function clawbackForRefund(
  input: ClawbackForRefundInput,
): Promise<ClawbackForRefundResult> {
  const {
    db,
    parentId,
    earnLedgerId,
    earnedPoints,
    refundedMinor,
    originalMinor,
    refundWalletLedgerId,
    postedBy = "system",
  } = input;

  const balance = await loyaltyBalance(db, parentId);

  // Idempotency: a *finalised* clawback (non-zero points_delta) tied to this
  // refund must not repeat. A zero-delta row tied to this refund is a pending
  // marker (S04, markPendingClawback) — finalisation is allowed to proceed and
  // will clear that pending. We therefore look only for an already-finalised
  // clawback here, and separately note any pending we must offset on finalise.
  const tied = await db
    .select({
      id: loyaltyLedger.id,
      pointsDelta: loyaltyLedger.pointsDelta,
      pendingClawback: loyaltyLedger.pendingClawback,
    })
    .from(loyaltyLedger)
    .where(
      and(
        eq(loyaltyLedger.parentId, parentId),
        eq(loyaltyLedger.kind, "clawback"),
        eq(loyaltyLedger.sourceWalletLedgerId, refundWalletLedgerId),
      ),
    );

  const finalised = tied.find((r) => r.pointsDelta !== 0);
  if (finalised) {
    return {
      ledgerId: finalised.id,
      clawedBack: 0,
      alreadyClawedBack: true,
      negativeCarry: false,
      balanceAfter: balance,
    };
  }

  // Sum any pending this refund provisioned (S04) so the finalised row offsets
  // it — once finalised the balance itself drops, so the pending must net to 0.
  const pendingToClear = tied.reduce((sum, r) => sum + (r.pendingClawback ?? 0), 0);

  const points = loyaltyClawbackPoints(earnedPoints, refundedMinor, originalMinor);
  if (points <= 0) {
    // Nothing to claw back. If we held a pending for this refund, release it so
    // a refund that nets to zero points does not strand the parent's balance.
    if (pendingToClear > 0) {
      const [release] = await db
        .insert(loyaltyLedger)
        .values({
          parentId,
          pointsDelta: 0,
          kind: "clawback",
          postedBy,
          reversesLoyaltyLedgerId: earnLedgerId,
          sourceWalletLedgerId: refundWalletLedgerId,
          pendingClawback: -pendingToClear,
        })
        .returning();
      return {
        ledgerId: release!.id,
        clawedBack: 0,
        alreadyClawedBack: false,
        negativeCarry: false,
        balanceAfter: balance,
      };
    }
    return {
      ledgerId: null,
      clawedBack: 0,
      alreadyClawedBack: false,
      negativeCarry: false,
      balanceAfter: balance,
    };
  }

  const balanceAfter = balance - points;
  const negativeCarry = balanceAfter < 0;

  const [row] = await db
    .insert(loyaltyLedger)
    .values({
      parentId,
      pointsDelta: -points,
      kind: "clawback",
      postedBy,
      reversesLoyaltyLedgerId: earnLedgerId,
      sourceWalletLedgerId: refundWalletLedgerId,
      negativeCarry,
      // Offset any pending provisioned for this refund (S04) so available-to-
      // redeem re-aligns with the reduced balance and is never double-counted.
      pendingClawback: -pendingToClear,
    })
    .returning();

  return {
    ledgerId: row!.id,
    clawedBack: points,
    alreadyClawedBack: false,
    negativeCarry,
    balanceAfter,
  };
}
