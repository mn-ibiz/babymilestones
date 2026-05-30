/** @bm/wallet — configurable, effective-dated loyalty rates (P2-E05-S02).
 *  Earn rate = KES of qualifying spend per 1 point. Redeem rate = KES value of
 *  1 point at redemption. Rates are effective-dated and append-only; changing a
 *  rate never rewrites historical earn/redeem rows. All conversions are integer
 *  cents — no float drift. */
import type { Database, Transaction } from "@bm/db";
import { audit, loyaltyRates } from "@bm/db";
import { and, desc, eq, lte } from "drizzle-orm";

type RateReader = Database | Transaction;

/** Default earn rate (KES of spend per point) before an admin first tunes it. */
export const DEFAULT_EARN_RATE = 100;
/** Default redeem rate (KES value per point) before an admin first tunes it. */
export const DEFAULT_REDEEM_RATE = 1;

const CENTS_PER_KES = 100;

export type LoyaltyRateType = "earn" | "redeem";

export interface EffectiveRates {
  /** KES of qualifying spend per 1 point earned. */
  earnRate: number;
  /** KES value of 1 point at redemption. */
  redeemRate: number;
}

/**
 * Whole points earned for a given spend (pure). Units: `spendCents` is integer
 * cents; `earnRate` is KES of spend per 1 point. `points = floor(spendCents /
 * (earnRate * 100))`. Integer math only — no float drift.
 */
export function pointsForSpend(spendCents: number, earnRate: number): number {
  if (!Number.isInteger(spendCents) || spendCents < 0) {
    throw new Error("spendCents must be a non-negative integer");
  }
  if (!Number.isInteger(earnRate) || earnRate <= 0) {
    throw new Error("earnRate must be a positive integer");
  }
  return Math.floor(spendCents / (earnRate * CENTS_PER_KES));
}

/**
 * KES value (in integer cents) of points at redemption (pure). Units:
 * `redeemRate` is KES per 1 point. `cents = points * redeemRate * 100`.
 * Integer math only.
 */
export function kesForPoints(points: number, redeemRate: number): number {
  if (!Number.isInteger(points) || points < 0) {
    throw new Error("points must be a non-negative integer");
  }
  if (!Number.isInteger(redeemRate) || redeemRate <= 0) {
    throw new Error("redeemRate must be a positive integer");
  }
  return points * redeemRate * CENTS_PER_KES;
}

async function effectiveRate(
  db: RateReader,
  rateType: LoyaltyRateType,
  at: Date,
  fallback: number,
): Promise<number> {
  const [row] = await db
    .select()
    .from(loyaltyRates)
    .where(
      and(
        eq(loyaltyRates.rateType, rateType),
        lte(loyaltyRates.effectiveFrom, at),
      ),
    )
    .orderBy(desc(loyaltyRates.effectiveFrom))
    .limit(1);
  return row ? row.value : fallback;
}

/**
 * Rates effective at a given timestamp (default now). Picks the latest row with
 * `effective_from <= at` for each rate type; falls back to defaults if none.
 */
export async function getEffectiveRates(
  db: RateReader,
  at: Date = new Date(),
): Promise<EffectiveRates> {
  const [earnRate, redeemRate] = await Promise.all([
    effectiveRate(db, "earn", at, DEFAULT_EARN_RATE),
    effectiveRate(db, "redeem", at, DEFAULT_REDEEM_RATE),
  ]);
  return { earnRate, redeemRate };
}

export interface SetRateInput {
  rateType: LoyaltyRateType;
  /** New rate value (positive integer). */
  value: number;
  /** When the new rate takes effect. Defaults to now. */
  effectiveFrom?: Date;
  /** Acting admin id (UUID) — for the audit row + created_by. */
  actor: string;
}

/**
 * Append a new effective-dated rate row. NEVER updates or deletes prior rows, so
 * historical earn/redeem rates remain immutable (AC2). Audited
 * (`loyalty.rate_change`). Caller enforces admin auth at the route layer.
 */
export async function setRate(db: Database, input: SetRateInput) {
  if (input.rateType !== "earn" && input.rateType !== "redeem") {
    throw new Error("rateType must be 'earn' or 'redeem'");
  }
  if (!Number.isInteger(input.value) || input.value <= 0) {
    throw new Error("rate value must be a positive integer");
  }
  const effectiveFrom = input.effectiveFrom ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(loyaltyRates)
      .values({
        rateType: input.rateType,
        value: input.value,
        effectiveFrom,
        createdBy: input.actor,
      })
      .returning();
    await audit(tx, {
      actor: input.actor,
      action: "loyalty.rate_change",
      target: { table: "loyalty_rates", id: row!.id },
      payload: {
        rate_type: input.rateType,
        value: input.value,
        effective_from: effectiveFrom.toISOString(),
      },
    });
    return row!;
  });
}
