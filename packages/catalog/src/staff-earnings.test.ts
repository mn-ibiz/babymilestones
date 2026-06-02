import { describe, expect, it } from "vitest";
import {
  monthBoundsUtc,
  computeStaffEarnings,
  type EarningsLedgerEntry,
  type EarningsPayout,
} from "./staff-earnings.js";

/**
 * P3-E02-S01 — pure earnings view-model. Given a staff member's commission-ledger
 * entries (signed cents, with `occurredAt`) and their confirmed payouts, compute
 * the three public numbers: month-to-date net, last calendar month's net, and the
 * most recent payout (amount + date). All math is integer-cents and the period
 * boundaries are UTC calendar months, exercised deterministically with an injected
 * `now`.
 */
describe("monthBoundsUtc (P3-E02-S01)", () => {
  it("returns this-month start, next-month start, and last-month start in UTC", () => {
    const now = new Date("2026-06-15T09:30:00.000Z");
    const b = monthBoundsUtc(now);
    expect(b.thisMonthStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(b.nextMonthStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(b.lastMonthStart.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rolls the year boundary correctly in January", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    const b = monthBoundsUtc(now);
    expect(b.thisMonthStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(b.nextMonthStart.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(b.lastMonthStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });
});

describe("computeStaffEarnings (P3-E02-S01 AC3)", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  function entry(amountCents: number, occurredAt: string): EarningsLedgerEntry {
    return { amountCents, occurredAt: new Date(occurredAt) };
  }

  it("sums net month-to-date commission from this calendar month only", () => {
    const ledger: EarningsLedgerEntry[] = [
      entry(50000, "2026-06-02T10:00:00.000Z"),
      entry(25000, "2026-06-14T10:00:00.000Z"),
      entry(99999, "2026-05-31T23:59:59.000Z"), // last month — excluded
      entry(11111, "2026-07-01T00:00:00.000Z"), // next month — excluded
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.monthToDateCents).toBe(75000);
  });

  it("nets reversals against accruals within a period", () => {
    const ledger: EarningsLedgerEntry[] = [
      entry(50000, "2026-06-02T10:00:00.000Z"),
      entry(-20000, "2026-06-05T10:00:00.000Z"), // refund reversal
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.monthToDateCents).toBe(30000);
  });

  it("sums last calendar month's net commission separately from MTD", () => {
    const ledger: EarningsLedgerEntry[] = [
      entry(40000, "2026-05-03T10:00:00.000Z"),
      entry(10000, "2026-05-29T10:00:00.000Z"),
      entry(70000, "2026-06-04T10:00:00.000Z"), // this month — not last month
      entry(5000, "2026-04-30T10:00:00.000Z"), // two months ago — excluded
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.lastMonthCents).toBe(50000);
    expect(v.monthToDateCents).toBe(70000);
  });

  it("picks the most recent confirmed payout (amount + date)", () => {
    const payouts: EarningsPayout[] = [
      { amountCents: 30000, paidOutAt: new Date("2026-04-30T00:00:00.000Z") },
      { amountCents: 45000, paidOutAt: new Date("2026-05-31T00:00:00.000Z") },
    ];
    const v = computeStaffEarnings({ ledger: [], payouts, now });
    expect(v.lastPayoutCents).toBe(45000);
    expect(v.lastPayoutAt?.toISOString()).toBe("2026-05-31T00:00:00.000Z");
  });

  it("reports null payout when the staff member has never been paid out", () => {
    const v = computeStaffEarnings({ ledger: [], payouts: [], now });
    expect(v.lastPayoutCents).toBeNull();
    expect(v.lastPayoutAt).toBeNull();
    expect(v.monthToDateCents).toBe(0);
    expect(v.lastMonthCents).toBe(0);
  });
});

describe("computeStaffEarnings breakdown (P3-E02-S02 AC1)", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  /** A month-to-date booking accrual attributed to `serviceName`. */
  function visit(amountCents: number, serviceName: string | null, day = 5): EarningsLedgerEntry {
    return {
      amountCents,
      occurredAt: new Date(`2026-06-${String(day).padStart(2, "0")}T10:00:00.000Z`),
      serviceName,
      isVisit: true,
    };
  }

  it("counts completed visits in the month-to-date window only", () => {
    const ledger: EarningsLedgerEntry[] = [
      visit(50000, "Wash & Style", 2),
      visit(30000, "Wash & Style", 9),
      visit(20000, "Braids", 14),
      // Last month — excluded from the MTD breakdown.
      {
        amountCents: 40000,
        occurredAt: new Date("2026-05-20T10:00:00.000Z"),
        serviceName: "Wash & Style",
        isVisit: true,
      },
      // A reversal in this month is NOT a completed visit (does not add to count).
      {
        amountCents: -10000,
        occurredAt: new Date("2026-06-10T10:00:00.000Z"),
        serviceName: "Wash & Style",
        isVisit: false,
      },
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.completedVisits).toBe(3);
  });

  it("ranks the top 3 services by visit count, ties broken alphabetically", () => {
    const ledger: EarningsLedgerEntry[] = [
      visit(10000, "Braids", 1),
      visit(10000, "Braids", 2),
      visit(10000, "Braids", 3), // Braids: 3
      visit(10000, "Wash", 4),
      visit(10000, "Wash", 5), // Wash: 2
      visit(10000, "Cut", 6),
      visit(10000, "Cut", 7), // Cut: 2 (ties Wash — Cut sorts first)
      visit(10000, "Dye", 8), // Dye: 1 (drops off — only top 3)
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.topServicesByCount).toEqual([
      { serviceName: "Braids", count: 3 },
      { serviceName: "Cut", count: 2 },
      { serviceName: "Wash", count: 2 },
    ]);
  });

  it("ranks the top 3 services by net revenue, reversals netted, ties alphabetical", () => {
    const ledger: EarningsLedgerEntry[] = [
      visit(50000, "Braids", 1),
      visit(50000, "Braids", 2), // Braids: 100000
      visit(80000, "Wash", 3),
      // reversal against Wash this month nets it down
      {
        amountCents: -20000,
        occurredAt: new Date("2026-06-04T10:00:00.000Z"),
        serviceName: "Wash",
        isVisit: false,
      }, // Wash: 60000
      visit(30000, "Cut", 5),
      visit(30000, "Dye", 6), // Cut 30000 ties Dye 30000 — Cut sorts first
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.topServicesByRevenue).toEqual([
      { serviceName: "Braids", revenueCents: 100000 },
      { serviceName: "Wash", revenueCents: 60000 },
      { serviceName: "Cut", revenueCents: 30000 },
    ]);
  });

  it("returns fewer than 3 entries when there are fewer distinct services", () => {
    const ledger: EarningsLedgerEntry[] = [visit(50000, "Braids", 1), visit(25000, "Wash", 2)];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.topServicesByCount).toEqual([
      { serviceName: "Braids", count: 1 },
      { serviceName: "Wash", count: 1 },
    ]);
    expect(v.topServicesByRevenue).toEqual([
      { serviceName: "Braids", revenueCents: 50000 },
      { serviceName: "Wash", revenueCents: 25000 },
    ]);
  });

  it("reports zero visits and empty service lists when there is no MTD activity", () => {
    const v = computeStaffEarnings({ ledger: [], payouts: [], now });
    expect(v.completedVisits).toBe(0);
    expect(v.topServicesByCount).toEqual([]);
    expect(v.topServicesByRevenue).toEqual([]);
  });

  it("buckets visits with an unknown service under a stable placeholder name", () => {
    const ledger: EarningsLedgerEntry[] = [
      visit(50000, null, 1),
      visit(30000, null, 2),
      visit(20000, "Braids", 3),
    ];
    const v = computeStaffEarnings({ ledger, payouts: [], now });
    expect(v.completedVisits).toBe(3);
    expect(v.topServicesByCount).toEqual([
      { serviceName: "Unattributed", count: 2 },
      { serviceName: "Braids", count: 1 },
    ]);
    expect(v.topServicesByRevenue).toEqual([
      { serviceName: "Unattributed", revenueCents: 80000 },
      { serviceName: "Braids", revenueCents: 20000 },
    ]);
  });
});
