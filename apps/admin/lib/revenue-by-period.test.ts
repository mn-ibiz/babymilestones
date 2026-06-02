import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRevenueByPeriod,
  revenueTiles,
  revenueExportHref,
  defaultRevenueRange,
  isValidRange,
  type RevenueByPeriod,
} from "./revenue-by-period";

/**
 * P3-E05-S02 (Story 27.2) — admin revenue-by-period client logic. Framework-free
 * so it unit-tests without React: the read seam over the admin-gated
 * `/admin/revenue-by-period` API (date-range filter), the chart-series + delta
 * view-model (re-exported from `@bm/contracts`), and the CSV export link (AC2).
 */

function report(over: Partial<RevenueByPeriod> = {}): RevenueByPeriod {
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    byUnit: [
      { unit: "play", revenueCents: 3500 },
      { unit: "talent", revenueCents: 0 },
      { unit: "salon", revenueCents: 4000 },
      { unit: "coaching", revenueCents: 0 },
      { unit: "event", revenueCents: 0 },
    ],
    totalCents: 7500,
    previousByUnit: [
      { unit: "play", revenueCents: 1000 },
      { unit: "talent", revenueCents: 0 },
      { unit: "salon", revenueCents: 8000 },
      { unit: "coaching", revenueCents: 0 },
      { unit: "event", revenueCents: 0 },
    ],
    previousTotalCents: 9000,
    deltaByUnit: [
      { unit: "play", deltaCents: 2500 },
      { unit: "talent", deltaCents: 0 },
      { unit: "salon", deltaCents: -4000 },
      { unit: "coaching", deltaCents: 0 },
      { unit: "event", deltaCents: 0 },
    ],
    totalDeltaCents: -1500,
    ...over,
  };
}

describe("fetchRevenueByPeriod (Story 27.2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report from the admin endpoint with the date-range filter (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchRevenueByPeriod({ fromDate: "2026-06-01", toDate: "2026-06-07" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/revenue-by-period?");
    expect(String(url)).toContain("fromDate=2026-06-01");
    expect(String(url)).toContain("toDate=2026-06-07");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(JSON.stringify({ error: "Forbidden: missing permission" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(fetchRevenueByPeriod({ fromDate: "2026-06-01", toDate: "2026-06-07" })).rejects.toThrow(/forbidden/i);
  });
});

describe("revenue view-model + export link (AC1/AC2)", () => {
  it("builds a chart-ready series with formatted deltas (AC1)", () => {
    const vm = revenueTiles(report());
    const play = vm.series.find((s) => s.unit === "play")!;
    expect(play.value).toBe("KES 35.00");
    expect(play.deltaValue).toBe("+KES 25.00");
    expect(play.deltaDirection).toBe("up");
    expect(vm.total.value).toBe("KES 75.00");
    expect(vm.total.deltaDirection).toBe("down");
  });

  it("builds the CSV export link carrying the same range (AC2)", () => {
    const href = revenueExportHref({ fromDate: "2026-06-01", toDate: "2026-06-07" });
    expect(href).toContain("/admin/revenue-by-period/export");
    expect(href).toContain("fromDate=2026-06-01");
    expect(href).toContain("toDate=2026-06-07");
  });
});

describe("range helpers (AC1)", () => {
  it("defaults to a 7-day range ending today (inclusive)", () => {
    const r = defaultRevenueRange(new Date("2026-06-14T12:00:00Z"));
    expect(r.toDate).toBe("2026-06-14");
    expect(r.fromDate).toBe("2026-06-08");
  });

  it("validates fromDate <= toDate", () => {
    expect(isValidRange({ fromDate: "2026-06-01", toDate: "2026-06-07" })).toBe(true);
    expect(isValidRange({ fromDate: "2026-06-08", toDate: "2026-06-01" })).toBe(false);
    expect(isValidRange({ fromDate: "", toDate: "2026-06-07" })).toBe(false);
  });
});
