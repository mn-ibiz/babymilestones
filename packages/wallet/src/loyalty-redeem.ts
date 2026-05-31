/** @bm/wallet — loyalty redemption.
 *
 * P2-E05-S03: redeemPoints — points → wallet credit, atomic + idempotent.
 * P3-E04-S04: availableLoyaltyToRedeem + markPendingClawback — redemption
 *             respects pending settlement (un-finalised refund hold).
 */
import type { Database, Transaction } from "@bm/db";
import { audit, loyaltyLedger, walletLedger } from "@bm/db";
import { and, eq, sql } from "drizzle-orm";
import { assertPositivePoints, getLoyaltyBalance } from "./loyalty.js";
import { getEffectiveRates, kesForPoints } from "./loyalty-rates.js";
import { availableToRedeem } from "@bm/contracts";

type LedgerReader = Database | Transaction;

// ── P2-E05 — redeemPoints ─────────────────────────────────────────────────────

export class InsufficientPointsError extends Error {
  readonly available: number;
  readonly requested: number;
  constructor(available: number, requested: number) {
    super(`cannot redeem ${requested} points: only ${available} available`);
    this.name = "InsufficientPointsError";
    this.available = available;
    this.requested = requested;
  }
}

export interface RedeemPointsInput {
  walletId: string;
  points: number;
  idempotencyKey: string;
  actor: string;
  redeemRate?: number;
  sourceType?: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RedeemPointsResult {
  redeemedPoints: number;
  discountCents: number;
  balance: number;
  loyaltyEntryId: string;
  walletEntryId: string;
}

export async function redeemPoints(
  db: Database,
  input: RedeemPointsInput,
): Promise<RedeemPointsResult> {
  assertPositivePoints(input.points);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      const balance = await getLoyaltyBalance(tx, input.walletId);
      const rate = existing.rateSnapshot!;
      return {
        redeemedPoints: existing.points!,
        discountCents: kesForPoints(existing.points!, rate),
        balance,
        loyaltyEntryId: existing.id,
        walletEntryId: existing.walletLedgerEntryId ?? "",
      };
    }
    const balanceBefore = await getLoyaltyBalance(tx, input.walletId);
    if (input.points > balanceBefore) {
      throw new InsufficientPointsError(balanceBefore, input.points);
    }
    const redeemRate = input.redeemRate ?? (await getEffectiveRates(tx)).redeemRate;
    const discountCents = kesForPoints(input.points, redeemRate);
    const walletKey = `loyalty-redeem:${input.idempotencyKey}`;
    const [walletRow] = await tx
      .insert(walletLedger)
      .values({
        walletId: input.walletId,
        amount: discountCents,
        direction: "credit",
        kind: "adjustment",
        idempotencyKey: walletKey,
        postedBy: input.actor,
        source: "loyalty",
      })
      .returning();
    const [loyaltyRow] = await tx
      .insert(loyaltyLedger)
      .values({
        walletId: input.walletId,
        direction: "redeem",
        points: input.points,
        rateSnapshot: redeemRate,
        walletLedgerEntryId: walletRow!.id,
        sourceType: input.sourceType ?? "redemption",
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      })
      .returning();
    await audit(tx, {
      actor: input.actor,
      action: "loyalty.redeem",
      target: { table: "loyalty_ledger", id: loyaltyRow!.id },
      payload: {
        wallet_id: input.walletId,
        points: input.points,
        redeem_rate: redeemRate,
        discount_cents: discountCents,
        wallet_ledger_entry_id: walletRow!.id,
      },
    });
    return {
      redeemedPoints: input.points,
      discountCents,
      balance: balanceBefore - input.points,
      loyaltyEntryId: loyaltyRow!.id,
      walletEntryId: walletRow!.id,
    };
  });
}

// ── P3-E04 — availableLoyaltyToRedeem + markPendingClawback ──────────────────

export interface AvailableLoyaltyToRedeem {
  balance: number;
  pendingClawback: number;
  availableToRedeem: number;
}

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
  return { balance, pendingClawback, availableToRedeem: availableToRedeem(balance, pendingClawback) };
}

export interface MarkPendingClawbackInput {
  db: LedgerReader;
  parentId: string;
  earnLedgerId: string;
  points: number;
  refundWalletLedgerId: string;
  postedBy?: string;
}

export interface MarkPendingClawbackResult {
  ledgerId: string;
  pending: number;
  alreadyPending: boolean;
}

export async function markPendingClawback(
  input: MarkPendingClawbackInput,
): Promise<MarkPendingClawbackResult> {
  const { db, parentId, earnLedgerId, points, refundWalletLedgerId, postedBy = "system" } = input;
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("markPendingClawback: points must be a positive integer");
  }
  const existing = await db
    .select({ id: loyaltyLedger.id })
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
      pointsDelta: 0,
      kind: "clawback",
      postedBy,
      reversesLoyaltyLedgerId: earnLedgerId,
      sourceWalletLedgerId: refundWalletLedgerId,
      pendingClawback: points,
    })
    .returning();
  return { ledgerId: row!.id, pending: points, alreadyPending: false };
}
