import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { createService } from "./services.js";
import {
  createPlan,
  getPlan,
  isSubscriptionPeriod,
  listPlanPrices,
  listPlans,
  PlanPriceOrderError,
  resolvePlanPriceAt,
  setPlanPrice,
  SUBSCRIPTION_PERIODS,
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
