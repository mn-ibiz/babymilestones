import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  audit,
  subscriptionPlans,
  subscriptionPlanPrices,
  subscriptions,
  type Database,
  type SubscriptionPeriod,
  type SubscriptionRow,
} from "@bm/db";
import type { Executor } from "./services.js";

/**
 * P2-E02-S01 — subscription plan catalogue. Mirrors the service catalogue
 * (P1-E07-S01): admin CRUD over `subscription_plans`, with effective-dated plan
 * prices (`subscription_plan_prices`) that are never mutated in place.
 */

/** The billing/entitlement periods a plan may use. */
export const SUBSCRIPTION_PERIODS = ["week", "month", "term"] as const satisfies readonly SubscriptionPeriod[];

/** True when `value` is one of the allowed subscription periods (narrowing guard). */
export function isSubscriptionPeriod(value: unknown): value is SubscriptionPeriod {
  return typeof value === "string" && (SUBSCRIPTION_PERIODS as readonly string[]).includes(value);
}

/**
 * Advance a date by one subscription period (UTC calendar math): `week` = +7
 * days, `month` = +1 calendar month, `term` ≈ +3 calendar months. Used for the
 * current-period end at subscribe time (P2-E02-S02) and on renewal (P2-E02-S05).
 */
export function addPeriod(from: Date, period: SubscriptionPeriod): Date {
  if (period === "week") {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  // Month / term: add calendar months, CLAMPING the day to the target month's
  // last day so Jan 31 + 1 month → Feb 28/29 (not a March rollover).
  const months = period === "month" ? 1 : 3;
  const day = from.getUTCDate();
  const target = new Date(from.getTime());
  target.setUTCDate(1); // avoid overflow while shifting the month
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Raised by {@link setPlanPrice} when a new price's `effectiveFrom` is not
 * strictly after the current open price's — history is append-forward only.
 */
export class PlanPriceOrderError extends Error {
  constructor(
    public readonly currentEffectiveFrom: string,
    public readonly attemptedEffectiveFrom: string,
  ) {
    super(
      `New plan price effectiveFrom (${attemptedEffectiveFrom}) must be after the current price's effectiveFrom (${currentEffectiveFrom})`,
    );
    this.name = "PlanPriceOrderError";
  }
}

export interface CreatePlanInput {
  serviceId: string;
  name: string;
  entitlementCount: number;
  period: SubscriptionPeriod;
  isActive?: boolean;
}

/** Create a subscription plan (AC1). Active by default. Returns the new row. */
export async function createPlan(db: Executor, input: CreatePlanInput) {
  const [row] = await db
    .insert(subscriptionPlans)
    .values({
      serviceId: input.serviceId,
      name: input.name,
      entitlementCount: input.entitlementCount,
      period: input.period,
      isActive: input.isActive ?? true,
    })
    .returning();
  return row!;
}

export interface UpdatePlanInput {
  name?: string;
  entitlementCount?: number;
  period?: SubscriptionPeriod;
  /** Soft-retire via `isActive=false` — plans are never hard-deleted. */
  isActive?: boolean;
}

/** Update a plan (AC2). Partial patch. Returns the updated row or null when unknown. */
export async function updatePlan(db: Executor, id: string, patch: UpdatePlanInput) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.entitlementCount !== undefined) set.entitlementCount = patch.entitlementCount;
  if (patch.period !== undefined) set.period = patch.period;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] = await db
    .update(subscriptionPlans)
    .set(set)
    .where(eq(subscriptionPlans.id, id))
    .returning();
  return row ?? null;
}

/** Read one plan by id, or null. */
export async function getPlan(db: Executor, id: string) {
  const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  return row ?? null;
}

/** List plans (optionally by service / active-only), newest first. */
export async function listPlans(
  db: Executor,
  opts: { serviceId?: string; activeOnly?: boolean } = {},
) {
  const filters = [];
  if (opts.serviceId !== undefined) filters.push(eq(subscriptionPlans.serviceId, opts.serviceId));
  if (opts.activeOnly) filters.push(eq(subscriptionPlans.isActive, true));
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  return db.select().from(subscriptionPlans).where(where).orderBy(desc(subscriptionPlans.createdAt));
}

/**
 * Set a new effective-dated plan price (AC3) — mirrors `setServicePrice`. Closes
 * the current open row (null `effectiveTo`) at `effectiveFrom`, then inserts a
 * new open row. Atomic. A new price must start strictly after the current one.
 */
export async function setPlanPrice(
  db: Database,
  input: { planId: string; amountCents: number; effectiveFrom: string },
) {
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(subscriptionPlanPrices)
      .where(
        and(eq(subscriptionPlanPrices.planId, input.planId), isNull(subscriptionPlanPrices.effectiveTo)),
      );
    if (open && input.effectiveFrom <= open.effectiveFrom) {
      throw new PlanPriceOrderError(open.effectiveFrom, input.effectiveFrom);
    }
    await tx
      .update(subscriptionPlanPrices)
      .set({ effectiveTo: input.effectiveFrom })
      .where(
        and(eq(subscriptionPlanPrices.planId, input.planId), isNull(subscriptionPlanPrices.effectiveTo)),
      );
    const [row] = await tx
      .insert(subscriptionPlanPrices)
      .values({
        planId: input.planId,
        amountCents: input.amountCents,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
      })
      .returning();
    return row!;
  });
}

/** Full price history for a plan, oldest first. */
export async function listPlanPrices(db: Executor, planId: string) {
  return db
    .select()
    .from(subscriptionPlanPrices)
    .where(eq(subscriptionPlanPrices.planId, planId))
    .orderBy(asc(subscriptionPlanPrices.effectiveFrom));
}

/**
 * Resolve the plan price applicable at `onDate` (half-open `[from, to)`), or null
 * when none covers the date. Mirrors `resolveServicePriceAt`.
 */
export async function resolvePlanPriceAt(db: Executor, planId: string, onDate: string) {
  const rows = await db
    .select()
    .from(subscriptionPlanPrices)
    .where(eq(subscriptionPlanPrices.planId, planId))
    .orderBy(asc(subscriptionPlanPrices.effectiveFrom));
  for (const row of rows) {
    const fromOk = row.effectiveFrom <= onDate;
    const toOk = row.effectiveTo === null || onDate < row.effectiveTo;
    if (fromOk && toOk) return row;
  }
  return null;
}

/* --- Pause / resume (P2-E02-S04) ----------------------------------------- */

/** The subscription id is unknown. */
export class SubscriptionNotFoundError extends Error {
  constructor(public readonly subscriptionId: string) {
    super(`Subscription not found: ${subscriptionId}`);
    this.name = "SubscriptionNotFoundError";
  }
}

/** The subscription is not in the state the operation requires. */
export class SubscriptionStateError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Subscription must be ${expected}, but is ${actual}`);
    this.name = "SubscriptionStateError";
  }
}

/**
 * Pause a subscription (P2-E02-S04 AC1): `status='paused'`, anchor `pausedAt`.
 * Entitlement is frozen (untouched), and the booking flow stops matching it (it
 * only matches active subs) so bookings fall back to wallet pay-as-you-go (AC2).
 * Throws when the subscription isn't currently active.
 */
export async function pauseSubscription(
  db: Database,
  input: { subscriptionId: string; actor?: string | null; ip?: string | null; now?: Date },
): Promise<SubscriptionRow> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, input.subscriptionId))
      .for("update");
    if (!sub) throw new SubscriptionNotFoundError(input.subscriptionId);
    if (sub.status !== "active") throw new SubscriptionStateError("active", sub.status);
    const [updated] = await tx
      .update(subscriptions)
      .set({ status: "paused", pausedAt: now, updatedAt: now })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    await audit(tx, {
      actor: input.actor ?? null,
      action: "subscription.paused",
      target: { table: "subscriptions", id: sub.id },
      payload: { entitlement_remaining: sub.entitlementRemaining, ip: input.ip ?? undefined },
    });
    return updated!;
  });
}

/**
 * Resume a paused subscription (P2-E02-S04 AC3): shift both period dates forward
 * by the pause duration (so paid-for time isn't lost), carry entitlement over,
 * close the pause interval into `pauseHistory`, and set `status='active'`.
 * Throws when the subscription isn't currently paused.
 */
export async function resumeSubscription(
  db: Database,
  input: { subscriptionId: string; actor?: string | null; ip?: string | null; now?: Date },
): Promise<SubscriptionRow> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, input.subscriptionId))
      .for("update");
    if (!sub) throw new SubscriptionNotFoundError(input.subscriptionId);
    if (sub.status !== "paused" || !sub.pausedAt) throw new SubscriptionStateError("paused", sub.status);

    const pauseMs = now.getTime() - sub.pausedAt.getTime();
    const newStart = new Date(sub.currentPeriodStart.getTime() + pauseMs);
    const newEnd = new Date(sub.currentPeriodEnd.getTime() + pauseMs);
    const history = [
      ...sub.pauseHistory,
      { pausedAt: sub.pausedAt.toISOString(), resumedAt: now.toISOString() },
    ];
    const [updated] = await tx
      .update(subscriptions)
      .set({
        status: "active",
        pausedAt: null,
        currentPeriodStart: newStart,
        currentPeriodEnd: newEnd,
        pauseHistory: history,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    await audit(tx, {
      actor: input.actor ?? null,
      action: "subscription.resumed",
      target: { table: "subscriptions", id: sub.id },
      payload: { pause_ms: pauseMs, ip: input.ip ?? undefined },
    });
    return updated!;
  });
}
