import { describe, expect, it } from "vitest";
import {
  PNL_UNITS,
  aggregatePnl,
  comparePnl,
  monthWindow,
  yearWindow,
  type PnlInput,
} from "./pnl-report.js";

/**
 * P6-E05-S01 (Story 35.1) — Consolidated P&L by period (pure reducer).
 *
 * AC1: per-unit REVENUE / DIRECT COSTS / EXPENSES / NET + consolidated totals.
 * AC2: period comparison (MoM / YoY) deltas.
 */
describe("aggregatePnl (AC1)", () => {
  it("computes per-unit net = revenue − directCosts − expenses, in PNL_UNITS order", () => {
    const input: PnlInput = {
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { play: 100_00, salon: 50_00 },
      directCostsByUnit: { shop: 20_00 },
      expensesByUnit: { play: 30_00, shop: 5_00 },
      sharedOverheadCents: 10_00,
    };
    const out = aggregatePnl(input);

    // Every business unit present (zero-filled) in canonical order.
    expect(out.byUnit.map((u) => u.unit)).toEqual([...PNL_UNITS]);

    const play = out.byUnit.find((u) => u.unit === "play")!;
    expect(play.revenueCents).toBe(100_00);
    expect(play.directCostsCents).toBe(0);
    expect(play.expensesCents).toBe(30_00);
    expect(play.netCents).toBe(100_00 - 0 - 30_00);

    const salon = out.byUnit.find((u) => u.unit === "salon")!;
    expect(salon.revenueCents).toBe(50_00);
    expect(salon.netCents).toBe(50_00);

    const shop = out.byUnit.find((u) => u.unit === "shop")!;
    expect(shop.revenueCents).toBe(0);
    expect(shop.directCostsCents).toBe(20_00);
    expect(shop.expensesCents).toBe(5_00);
    expect(shop.netCents).toBe(0 - 20_00 - 5_00);
  });

  it("consolidated totals sum the per-unit columns", () => {
    const input: PnlInput = {
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { play: 100_00, salon: 50_00 },
      directCostsByUnit: { shop: 20_00 },
      expensesByUnit: { play: 30_00, shop: 5_00 },
      sharedOverheadCents: 10_00,
    };
    const out = aggregatePnl(input);

    expect(out.totals.revenueCents).toBe(150_00);
    expect(out.totals.directCostsCents).toBe(20_00);
    // unit expenses only; shared overhead is a SEPARATE line, not bucketed into a unit.
    expect(out.totals.expensesCents).toBe(35_00);
  });

  it("shows shared overhead as a SEPARATE line and subtracts it from the consolidated net only", () => {
    const input: PnlInput = {
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { play: 100_00 },
      directCostsByUnit: {},
      expensesByUnit: { play: 30_00 },
      sharedOverheadCents: 10_00,
    };
    const out = aggregatePnl(input);

    // Shared overhead is unallocated — exposed on the totals, not on any unit.
    expect(out.totals.sharedOverheadCents).toBe(10_00);

    // Sum of per-unit net (overhead NOT yet deducted).
    const sumUnitNet = out.byUnit.reduce((a, u) => a + u.netCents, 0);
    expect(sumUnitNet).toBe(100_00 - 30_00);

    // Consolidated net = revenue − directCosts − unitExpenses − sharedOverhead.
    expect(out.totals.netCents).toBe(100_00 - 0 - 30_00 - 10_00);
  });

  it("zero data → all zeros, every unit present", () => {
    const out = aggregatePnl({
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: {},
      directCostsByUnit: {},
      expensesByUnit: {},
      sharedOverheadCents: 0,
    });
    expect(out.byUnit).toHaveLength(PNL_UNITS.length);
    for (const u of out.byUnit) {
      expect(u.revenueCents).toBe(0);
      expect(u.directCostsCents).toBe(0);
      expect(u.expensesCents).toBe(0);
      expect(u.netCents).toBe(0);
    }
    expect(out.totals.revenueCents).toBe(0);
    expect(out.totals.directCostsCents).toBe(0);
    expect(out.totals.expensesCents).toBe(0);
    expect(out.totals.sharedOverheadCents).toBe(0);
    expect(out.totals.netCents).toBe(0);
  });

  it("ignores unknown unit codes in the input maps (defensive)", () => {
    const out = aggregatePnl({
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { play: 10_00, bogus: 999_00 } as Record<string, number>,
      directCostsByUnit: {},
      expensesByUnit: {},
      sharedOverheadCents: 0,
    });
    expect(out.totals.revenueCents).toBe(10_00);
  });
});

describe("comparePnl (AC2)", () => {
  it("computes per-unit + consolidated deltas (current − prior)", () => {
    const current = aggregatePnl({
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { play: 100_00 },
      directCostsByUnit: {},
      expensesByUnit: { play: 30_00 },
      sharedOverheadCents: 10_00,
    });
    const prior = aggregatePnl({
      from: "2026-04-01",
      to: "2026-05-01",
      revenueByUnit: { play: 60_00 },
      directCostsByUnit: {},
      expensesByUnit: { play: 20_00 },
      sharedOverheadCents: 10_00,
    });

    const cmp = comparePnl(current, prior);

    expect(cmp.current).toBe(current);
    expect(cmp.previous).toBe(prior);

    const playDelta = cmp.deltaByUnit.find((u) => u.unit === "play")!;
    expect(playDelta.revenueDeltaCents).toBe(40_00);
    expect(playDelta.netDeltaCents).toBe(current.byUnit.find((u) => u.unit === "play")!.netCents - prior.byUnit.find((u) => u.unit === "play")!.netCents);

    expect(cmp.totalsDelta.revenueDeltaCents).toBe(40_00);
    expect(cmp.totalsDelta.netDeltaCents).toBe(current.totals.netCents - prior.totals.netCents);
  });

  it("zero prior → delta equals the current figures", () => {
    const current = aggregatePnl({
      from: "2026-05-01",
      to: "2026-06-01",
      revenueByUnit: { salon: 80_00 },
      directCostsByUnit: {},
      expensesByUnit: {},
      sharedOverheadCents: 0,
    });
    const prior = aggregatePnl({
      from: "2026-04-01",
      to: "2026-05-01",
      revenueByUnit: {},
      directCostsByUnit: {},
      expensesByUnit: {},
      sharedOverheadCents: 0,
    });
    const cmp = comparePnl(current, prior);
    expect(cmp.totalsDelta.revenueDeltaCents).toBe(80_00);
    expect(cmp.totalsDelta.netDeltaCents).toBe(80_00);
  });
});

describe("monthWindow / yearWindow (AC2 — comparison periods)", () => {
  it("monthWindow returns the half-open [first-of-month, first-of-next-month) and its prior month", () => {
    const w = monthWindow("2026-05-17");
    expect(w.from).toBe("2026-05-01");
    expect(w.to).toBe("2026-06-01");
    expect(w.prior.from).toBe("2026-04-01");
    expect(w.prior.to).toBe("2026-05-01");
  });

  it("monthWindow handles a January anchor (prior = last December)", () => {
    const w = monthWindow("2026-01-09");
    expect(w.from).toBe("2026-01-01");
    expect(w.to).toBe("2026-02-01");
    expect(w.prior.from).toBe("2025-12-01");
    expect(w.prior.to).toBe("2026-01-01");
  });

  it("yearWindow returns the half-open [Jan 1, next Jan 1) and the prior year", () => {
    const w = yearWindow("2026-05-17");
    expect(w.from).toBe("2026-01-01");
    expect(w.to).toBe("2027-01-01");
    expect(w.prior.from).toBe("2025-01-01");
    expect(w.prior.to).toBe("2026-01-01");
  });
});
