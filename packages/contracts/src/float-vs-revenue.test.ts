import { describe, expect, it } from "vitest";
import {
  floatVsRevenueQuerySchema,
  floatVsRevenueViewModel,
  FLOAT_VS_REVENUE_DEFAULT_DAYS,
  FLOAT_VS_REVENUE_MAX_DAYS,
  type FloatVsRevenueDto,
} from "./index.js";

/**
 * P5-E05-S04 (Story 35.4) — wallet float vs revenue contracts. A query schema
 * (the optional `asOf` snapshot day + the window length, 90 days by default), the
 * snapshot + series DTOs, and the pure view-model that shapes the KPIs + the
 * float-vs-revenue chart series for the admin page.
 */
function dto(): FloatVsRevenueDto {
  return {
    from: "2026-06-01",
    to: "2026-06-03",
    snapshot: {
      date: "2026-06-03",
      walletLiabilityCents: 62_000,
      segregatedBalanceCents: 60_000,
      revenueCents: 3_500,
      priorDayDeltaCents: 12_000,
    },
    series: [
      { date: "2026-06-01", walletLiabilityCents: 50_000, segregatedBalanceCents: 48_000, revenueCents: 1_000, priorDayDeltaCents: 50_000 },
      { date: "2026-06-02", walletLiabilityCents: 50_000, segregatedBalanceCents: 48_000, revenueCents: 0, priorDayDeltaCents: 0 },
      { date: "2026-06-03", walletLiabilityCents: 62_000, segregatedBalanceCents: 60_000, revenueCents: 3_500, priorDayDeltaCents: 12_000 },
    ],
  };
}

describe("floatVsRevenueQuerySchema (Story 35.4)", () => {
  it("accepts an empty query (defaults to today, 90 days)", () => {
    const parsed = floatVsRevenueQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.days).toBe(FLOAT_VS_REVENUE_DEFAULT_DAYS);
  });

  it("accepts an explicit asOf snapshot day", () => {
    const parsed = floatVsRevenueQuerySchema.safeParse({ asOf: "2026-06-02" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.asOf).toBe("2026-06-02");
  });

  it("rejects a malformed asOf", () => {
    expect(floatVsRevenueQuerySchema.safeParse({ asOf: "nope" }).success).toBe(false);
  });

  it("coerces a string days param and accepts a custom window", () => {
    const parsed = floatVsRevenueQuerySchema.safeParse({ days: "30" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.days).toBe(30);
  });

  it("rejects a window over the cap or below 1", () => {
    expect(floatVsRevenueQuerySchema.safeParse({ days: String(FLOAT_VS_REVENUE_MAX_DAYS + 1) }).success).toBe(false);
    expect(floatVsRevenueQuerySchema.safeParse({ days: "0" }).success).toBe(false);
  });
});

describe("floatVsRevenueViewModel (Story 35.4)", () => {
  it("formats the snapshot KPIs as KES with a signed prior-day delta (AC1)", () => {
    const vm = floatVsRevenueViewModel(dto());
    expect(vm.snapshot.date).toBe("2026-06-03");
    expect(vm.snapshot.walletLiability).toBe("KES 620.00");
    expect(vm.snapshot.segregatedBalance).toBe("KES 600.00");
    expect(vm.snapshot.revenue).toBe("KES 35.00");
    expect(vm.snapshot.priorDayDelta).toBe("+KES 120.00");
    expect(vm.snapshot.priorDayDeltaDirection).toBe("up");
  });

  it("shows a down direction + minus sign when liability falls", () => {
    const d = dto();
    d.snapshot.priorDayDeltaCents = -5_000;
    const vm = floatVsRevenueViewModel(d);
    expect(vm.snapshot.priorDayDelta).toBe("-KES 50.00");
    expect(vm.snapshot.priorDayDeltaDirection).toBe("down");
  });

  it("exposes the full series for the float-vs-revenue chart (AC2)", () => {
    const vm = floatVsRevenueViewModel(dto());
    expect(vm.series).toHaveLength(3);
    expect(vm.series.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(vm.series[2]).toMatchObject({
      walletLiabilityCents: 62_000,
      segregatedBalanceCents: 60_000,
      revenueCents: 3_500,
    });
    expect(vm.series[2]!.walletLiability).toBe("KES 620.00");
    expect(vm.series[2]!.revenue).toBe("KES 35.00");
  });
});
