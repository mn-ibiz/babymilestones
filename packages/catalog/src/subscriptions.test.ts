import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { children, parents, subscriptions, users } from "@bm/db";
import { createService } from "./services.js";
import {
  addPeriod,
  createPlan,
  getPlan,
  isSubscriptionPeriod,
  listPlanPrices,
  listPlans,
  pauseSubscription,
  PlanPriceOrderError,
  requestSubscriptionCancellation,
  resolvePlanPriceAt,
  resumeSubscription,
  reverseSubscriptionCancellation,
  setPlanPrice,
  SUBSCRIPTION_PERIODS,
  SubscriptionStateError,
  updatePlan,
} from "./subscriptions.js";

/**
 * P2-E02-S01 — subscription plan catalogue + effective-dated plan prices.
 * DB-backed via PGlite. Mirrors the service-catalogue tests.
 */
describe("subscription plans (P2-E02-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const seedService = () => createService(dbh.db, { name: "Soft Play", unit: "play" });

  it("knows the period taxonomy", () => {
    expect(SUBSCRIPTION_PERIODS).toEqual(["week", "month", "term"]);
    expect(isSubscriptionPeriod("month")).toBe(true);
    expect(isSubscriptionPeriod("year")).toBe(false);
  });

  it("addPeriod advances by week/month/term, clamping month-end (no rollover)", () => {
    expect(addPeriod(new Date("2026-06-15T00:00:00Z"), "week").toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(addPeriod(new Date("2026-06-15T00:00:00Z"), "month").toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(addPeriod(new Date("2026-06-15T00:00:00Z"), "term").toISOString().slice(0, 10)).toBe("2026-09-15");
    // Jan 31 + 1 month clamps to Feb 28 (2026 is not a leap year) — never March.
    expect(addPeriod(new Date("2026-01-31T00:00:00Z"), "month").toISOString().slice(0, 10)).toBe("2026-02-28");
    // Leap year: Jan 31 + 1 month → Feb 29.
    expect(addPeriod(new Date("2028-01-31T00:00:00Z"), "month").toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("creates a plan active by default (AC1)", async () => {
    const svc = await seedService();
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "8 Play / month", entitlementCount: 8, period: "month" });
    expect(plan.name).toBe("8 Play / month");
    expect(plan.entitlementCount).toBe(8);
    expect(plan.period).toBe("month");
    expect(plan.isActive).toBe(true);
    expect(await getPlan(dbh.db, plan.id)).not.toBeNull();
  });

  it("updates + soft-retires a plan (AC2)", async () => {
    const svc = await seedService();
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "P", entitlementCount: 4, period: "week" });
    const updated = await updatePlan(dbh.db, plan.id, { entitlementCount: 6, isActive: false });
    expect(updated!.entitlementCount).toBe(6);
    expect(updated!.isActive).toBe(false);
    expect(await updatePlan(dbh.db, "00000000-0000-0000-0000-000000000000", { name: "x" })).toBeNull();
  });

  it("lists plans filtered by service + active flag", async () => {
    const a = await seedService();
    const b = await seedService();
    await createPlan(dbh.db, { serviceId: a.id, name: "1", entitlementCount: 4, period: "month" });
    await createPlan(dbh.db, { serviceId: a.id, name: "2", entitlementCount: 4, period: "month", isActive: false });
    await createPlan(dbh.db, { serviceId: b.id, name: "3", entitlementCount: 4, period: "month" });
    expect(await listPlans(dbh.db, { serviceId: a.id })).toHaveLength(2);
    expect(await listPlans(dbh.db, { serviceId: a.id, activeOnly: true })).toHaveLength(1);
    expect(await listPlans(dbh.db)).toHaveLength(3);
  });

  it("sets an effective-dated price, preserves history, resolves by date (AC3)", async () => {
    const svc = await seedService();
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "P", entitlementCount: 8, period: "month" });
    await setPlanPrice(dbh.db, { planId: plan.id, amountCents: 5000, effectiveFrom: "2026-01-01" });
    await setPlanPrice(dbh.db, { planId: plan.id, amountCents: 6000, effectiveFrom: "2026-06-01" });

    const history = await listPlanPrices(dbh.db, plan.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.effectiveTo).toBe("2026-06-01"); // old row closed
    expect(history[1]!.effectiveTo).toBeNull(); // new open row

    expect((await resolvePlanPriceAt(dbh.db, plan.id, "2026-03-01"))!.amountCents).toBe(5000);
    expect((await resolvePlanPriceAt(dbh.db, plan.id, "2026-07-01"))!.amountCents).toBe(6000);
    expect(await resolvePlanPriceAt(dbh.db, plan.id, "2025-12-01")).toBeNull();
  });

  it("rejects a backdated price (no overwrite) (AC3)", async () => {
    const svc = await seedService();
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "P", entitlementCount: 8, period: "month" });
    await setPlanPrice(dbh.db, { planId: plan.id, amountCents: 5000, effectiveFrom: "2026-06-01" });
    await expect(
      setPlanPrice(dbh.db, { planId: plan.id, amountCents: 4000, effectiveFrom: "2026-05-01" }),
    ).rejects.toBeInstanceOf(PlanPriceOrderError);
  });
});

describe("subscription pause / resume (P2-E02-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedSubscription() {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "P", entitlementCount: 8, period: "month" });
    const [u] = await dbh.db.insert(users).values({ phone: "+254712000001", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
    const [sub] = await dbh.db
      .insert(subscriptions)
      .values({
        parentId: p!.id,
        childId: c!.id,
        planId: plan.id,
        currentPeriodStart: new Date("2026-06-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-07-01T00:00:00Z"),
        status: "active",
        entitlementRemaining: 5,
      })
      .returning();
    return sub!.id;
  }

  it("pauses an active subscription, freezing entitlement (AC1)", async () => {
    const id = await seedSubscription();
    const paused = await pauseSubscription(dbh.db, { subscriptionId: id, now: new Date("2026-06-10T00:00:00Z") });
    expect(paused.status).toBe("paused");
    expect(paused.entitlementRemaining).toBe(5); // frozen
    expect(paused.pausedAt).not.toBeNull();
  });

  it("rejects pausing a non-active subscription", async () => {
    const id = await seedSubscription();
    await pauseSubscription(dbh.db, { subscriptionId: id, now: new Date("2026-06-10T00:00:00Z") });
    await expect(pauseSubscription(dbh.db, { subscriptionId: id })).rejects.toBeInstanceOf(SubscriptionStateError);
  });

  it("resume shifts period dates by the pause duration; entitlement carries over (AC3)", async () => {
    const id = await seedSubscription();
    await pauseSubscription(dbh.db, { subscriptionId: id, now: new Date("2026-06-10T00:00:00Z") });
    const resumed = await resumeSubscription(dbh.db, { subscriptionId: id, now: new Date("2026-06-20T00:00:00Z") });
    expect(resumed.status).toBe("active");
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.entitlementRemaining).toBe(5); // carried over
    // Paused 10 days → both period dates shift +10 days.
    expect(resumed.currentPeriodStart.toISOString().slice(0, 10)).toBe("2026-06-11");
    expect(resumed.currentPeriodEnd.toISOString().slice(0, 10)).toBe("2026-07-11");
    expect(resumed.pauseHistory).toHaveLength(1);
  });

  it("rejects resuming a non-paused subscription", async () => {
    const id = await seedSubscription();
    await expect(resumeSubscription(dbh.db, { subscriptionId: id })).rejects.toBeInstanceOf(SubscriptionStateError);
  });

  it("schedules a cancellation (flag set, still active) and reverses it (P2-E02-S06 AC1/AC2)", async () => {
    const id = await seedSubscription();
    const requested = await requestSubscriptionCancellation(dbh.db, { subscriptionId: id });
    expect(requested.cancelAtPeriodEnd).toBe(true);
    expect(requested.status).toBe("active"); // current period plays out
    const reversed = await reverseSubscriptionCancellation(dbh.db, { subscriptionId: id });
    expect(reversed.cancelAtPeriodEnd).toBe(false);
    expect(reversed.status).toBe("active");
  });
});
