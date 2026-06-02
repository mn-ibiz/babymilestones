import { describe, expect, it } from "vitest";
import {
  aggregateRevenueByPeriod,
  precedingPeriod,
  type RevenuePeriodInput,
} from "./revenue-by-period.js";

/**
 * P3-E05-S02 (Story 27.2) — per-unit revenue over a date range + period-over-period
 * delta. The pure {@link aggregateRevenueByPeriod} reducer turns the period's flat
 * booking-revenue rows (and the refund rows that net them down) into a per-unit
 * series + total, and pairs it with the immediately-preceding equal-length period
 * for the delta. No I/O — exhaustively unit-tested.
 *
 *  - REVENUE per unit = Σ(non-cancelled booking `staffRateSnapshot`) for the unit,
 *    MINUS Σ(refunds attributed to that unit) — i.e. NET revenue (AC3).
 *  - DELTA = thisPeriod − previousPeriod, per unit + total. Positive = growth.
 */

function input(over: Partial<RevenuePeriodInput> = {}): RevenuePeriodInput {
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    current: { bookings: [], refunds: [] },
    previous: { bookings: [], refunds: [] },
    ...over,
  };
}

describe("aggregateRevenueByPeriod (Story 27.2)", () => {
  it("sums per-unit revenue across the period, every unit zero-filled (AC1)", () => {
    const out = aggregateRevenueByPeriod(
      input({
        current: {
          bookings: [
            { unit: "play", revenueCents: 1000 },
            { unit: "play", revenueCents: 1500 },
            { unit: "salon", revenueCents: 5000 },
          ],
          refunds: [],
        },
      }),
    );
    const byUnit = Object.fromEntries(out.byUnit.map((u) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(2500);
    expect(byUnit.salon).toBe(5000);
    expect(byUnit.talent).toBe(0);
    expect(byUnit.coaching).toBe(0);
    expect(byUnit.event).toBe(0);
    // Always one row per unit, in SERVICE_UNITS order.
    expect(out.byUnit.map((u) => u.unit)).toEqual(["play", "talent", "salon", "coaching", "event"]);
    expect(out.totalCents).toBe(7500);
  });

  it("excludes refunded amounts — net revenue per unit (AC3)", () => {
    const out = aggregateRevenueByPeriod(
      input({
        current: {
          bookings: [
            { unit: "play", revenueCents: 1000 },
            { unit: "salon", revenueCents: 5000 },
          ],
          // 400 refunded against a play booking, 1000 against salon.
          refunds: [
            { unit: "play", refundCents: 400 },
            { unit: "salon", refundCents: 1000 },
          ],
        },
      }),
    );
    const byUnit = Object.fromEntries(out.byUnit.map((u) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(600); // 1000 − 400
    expect(byUnit.salon).toBe(4000); // 5000 − 1000
    expect(out.totalCents).toBe(4600);
  });

  it("an empty range yields zeroed units + zero total (AC1)", () => {
    const out = aggregateRevenueByPeriod(input());
    expect(out.totalCents).toBe(0);
    expect(out.byUnit).toHaveLength(5);
    expect(out.byUnit.every((u) => u.revenueCents === 0)).toBe(true);
  });

  it("computes the period-over-period delta per unit + total (AC1)", () => {
    const out = aggregateRevenueByPeriod(
      input({
        current: {
          bookings: [
            { unit: "play", revenueCents: 3000 },
            { unit: "salon", revenueCents: 5000 },
          ],
          refunds: [],
        },
        previous: {
          bookings: [
            { unit: "play", revenueCents: 1000 },
            { unit: "salon", revenueCents: 8000 },
          ],
          refunds: [],
        },
      }),
    );
    const deltaByUnit = Object.fromEntries(out.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
    expect(deltaByUnit.play).toBe(2000); // 3000 − 1000 (growth)
    expect(deltaByUnit.salon).toBe(-3000); // 5000 − 8000 (decline)
    expect(deltaByUnit.talent).toBe(0); // 0 − 0
    expect(out.previousTotalCents).toBe(9000);
    expect(out.totalDeltaCents).toBe(-1000); // 8000 − 9000
  });

  it("with a zero previous period the delta equals the current revenue (AC1)", () => {
    const out = aggregateRevenueByPeriod(
      input({
        current: { bookings: [{ unit: "play", revenueCents: 2500 }], refunds: [] },
        previous: { bookings: [], refunds: [] },
      }),
    );
    const deltaByUnit = Object.fromEntries(out.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
    expect(out.previousTotalCents).toBe(0);
    expect(deltaByUnit.play).toBe(2500);
    expect(out.totalDeltaCents).toBe(2500);
  });

  it("refunds in the previous period net it down too (AC3)", () => {
    const out = aggregateRevenueByPeriod(
      input({
        current: { bookings: [{ unit: "play", revenueCents: 2000 }], refunds: [] },
        previous: {
          bookings: [{ unit: "play", revenueCents: 3000 }],
          refunds: [{ unit: "play", refundCents: 1000 }],
        },
      }),
    );
    expect(out.previousTotalCents).toBe(2000); // 3000 − 1000
    const deltaByUnit = Object.fromEntries(out.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
    expect(deltaByUnit.play).toBe(0); // 2000 − 2000
    expect(out.totalDeltaCents).toBe(0);
  });

  it("echoes the from/to bounds on the result", () => {
    const out = aggregateRevenueByPeriod(input({ from: "2026-01-01", to: "2026-01-31" }));
    expect(out.from).toBe("2026-01-01");
    expect(out.to).toBe("2026-01-31");
  });
});

describe("precedingPeriod (Story 27.2)", () => {
  it("returns the immediately-preceding equal-length range", () => {
    // 7-day period 06-08..06-14 → preceding 7 days is 06-01..06-07.
    expect(precedingPeriod("2026-06-08", "2026-06-14")).toEqual({
      from: "2026-06-01",
      to: "2026-06-07",
    });
  });

  it("handles a single-day period", () => {
    expect(precedingPeriod("2026-06-08", "2026-06-08")).toEqual({
      from: "2026-06-07",
      to: "2026-06-07",
    });
  });

  it("handles a month-length period across a month boundary", () => {
    // 06-01..06-30 is 30 days → preceding 30 days ends 05-31, starts 05-02.
    expect(precedingPeriod("2026-06-01", "2026-06-30")).toEqual({
      from: "2026-05-02",
      to: "2026-05-31",
    });
  });
});
