import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatEarningsCents,
  formatPayoutDate,
  formatVisitCount,
  topByCountRows,
  topByRevenueRows,
  fetchStaffOptions,
  fetchStaffEarnings,
  type StaffEarnings,
} from "./staff-earnings";

/** A fully-populated earnings DTO for view-model tests (S02). */
function earnings(overrides: Partial<StaffEarnings> = {}): StaffEarnings {
  return {
    staffId: "s1",
    displayName: "Asha",
    monthToDateCents: 75000,
    lastMonthCents: 40000,
    lastPayoutCents: 45000,
    lastPayoutAt: "2026-05-31T00:00:00.000Z",
    completedVisits: 0,
    topServicesByCount: [],
    topServicesByRevenue: [],
    ...overrides,
  };
}

/**
 * Admin public staff-earnings viewer client logic (P3-E02-S01). Framework-free so
 * it unit-tests without React: cents formatting, the payout-date label, and the
 * two read seams (active-staff dropdown + per-staff figures) over the public,
 * unauthenticated `/public/staff-earnings` API.
 */

describe("formatEarningsCents (P3-E02-S01)", () => {
  it("formats integer cents as KES with no float drift", () => {
    expect(formatEarningsCents(150000)).toBe("KES 1,500.00");
    expect(formatEarningsCents(625)).toBe("KES 6.25");
    expect(formatEarningsCents(0)).toBe("KES 0.00");
  });
  it("renders a missing (null) payout amount as a dash", () => {
    expect(formatEarningsCents(null)).toBe("—");
  });
});

describe("formatPayoutDate (P3-E02-S01)", () => {
  it("renders the calendar date of a payout ISO timestamp", () => {
    expect(formatPayoutDate("2026-05-31T00:00:00.000Z")).toBe("2026-05-31");
  });
  it("renders a dash when there has been no payout", () => {
    expect(formatPayoutDate(null)).toBe("—");
  });
});

describe("fetchStaffOptions (P3-E02-S01 AC2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the active-staff dropdown options from the public endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ staff: [{ id: "s1", displayName: "Asha" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const options = await fetchStaffOptions();
    expect(options).toEqual([{ id: "s1", displayName: "Asha" }]);
  });
});

describe("fetchStaffEarnings (P3-E02-S01 AC3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads one staff member's figures from the public endpoint", async () => {
    const dto: StaffEarnings = earnings({
      completedVisits: 4,
      topServicesByCount: [{ serviceName: "Braids", count: 2 }],
      topServicesByRevenue: [{ serviceName: "Braids", revenueCents: 80000 }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(dto), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const out = await fetchStaffEarnings("s1");
    expect(out).toEqual(dto);
  });

  it("surfaces a 429 (rate-limited) as a friendly error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Too many requests. Try again shortly." }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(fetchStaffEarnings("s1")).rejects.toThrow(/too many/i);
  });
});

describe("formatVisitCount (P3-E02-S02 AC1)", () => {
  it("pluralises the visit label", () => {
    expect(formatVisitCount(0)).toBe("0 visits");
    expect(formatVisitCount(1)).toBe("1 visit");
    expect(formatVisitCount(2)).toBe("2 visits");
  });
});

describe("topByCountRows / topByRevenueRows (P3-E02-S02 AC1)", () => {
  it("shapes the top-services-by-count list into name + visit-count rows", () => {
    const rows = topByCountRows(
      earnings({
        topServicesByCount: [
          { serviceName: "Braids", count: 2 },
          { serviceName: "Wash", count: 1 },
        ],
      }),
    );
    expect(rows).toEqual([
      { serviceName: "Braids", detail: "2 visits" },
      { serviceName: "Wash", detail: "1 visit" },
    ]);
  });

  it("shapes the top-services-by-revenue list into name + KES rows", () => {
    const rows = topByRevenueRows(
      earnings({
        topServicesByRevenue: [
          { serviceName: "Braids", revenueCents: 80000 },
          { serviceName: "Wash", revenueCents: 30000 },
        ],
      }),
    );
    expect(rows).toEqual([
      { serviceName: "Braids", detail: "KES 800.00" },
      { serviceName: "Wash", detail: "KES 300.00" },
    ]);
  });

  it("renders empty lists when there is no breakdown activity", () => {
    expect(topByCountRows(earnings())).toEqual([]);
    expect(topByRevenueRows(earnings())).toEqual([]);
  });

  it("carries ONLY service names + numbers — no customer identifiers (S02 AC2)", () => {
    const rows = topByCountRows(earnings({ topServicesByCount: [{ serviceName: "Braids", count: 2 }] }));
    const keys = new Set(rows.flatMap((r) => Object.keys(r)));
    expect([...keys].sort()).toEqual(["detail", "serviceName"]);
  });
});
