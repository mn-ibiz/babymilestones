import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPnlReport,
  pnlCsvHref,
  pnlPdfHref,
  defaultPnlAnchor,
  isValidPnlGranularity,
  type PnlComparison,
} from "./pnl-report";

/**
 * P6-E05-S01 (Story 35.1) — admin consolidated-P&L client logic. Framework-free so
 * it unit-tests without React: the read seam over the admin-gated
 * `/admin/pnl-report` API (anchor + granularity), and the CSV ("Excel") + printable
 * HTML ("PDF") export links (AC3).
 */

function report(over: Partial<PnlComparison> = {}): PnlComparison {
  return {
    granularity: "month",
    current: {
      from: "2026-05-01",
      to: "2026-06-01",
      byUnit: [
        { unit: "play", revenueCents: 100_00, directCostsCents: 0, expensesCents: 30_00, netCents: 70_00 },
        { unit: "shop", revenueCents: 0, directCostsCents: 0, expensesCents: 5_00, netCents: -5_00 },
      ],
      totals: { revenueCents: 100_00, directCostsCents: 0, expensesCents: 35_00, sharedOverheadCents: 10_00, netCents: 55_00 },
    },
    previous: {
      from: "2026-04-01",
      to: "2026-05-01",
      byUnit: [{ unit: "play", revenueCents: 60_00, directCostsCents: 0, expensesCents: 20_00, netCents: 40_00 }],
      totals: { revenueCents: 60_00, directCostsCents: 0, expensesCents: 20_00, sharedOverheadCents: 10_00, netCents: 30_00 },
    },
    deltaByUnit: [{ unit: "play", revenueDeltaCents: 40_00, directCostsDeltaCents: 0, expensesDeltaCents: 10_00, netDeltaCents: 30_00 }],
    totalsDelta: { revenueDeltaCents: 40_00, directCostsDeltaCents: 0, expensesDeltaCents: 15_00, sharedOverheadDeltaCents: 0, netDeltaCents: 25_00 },
    ...over,
  };
}

describe("fetchPnlReport (Story 35.1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report from the admin endpoint with anchor + granularity (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPnlReport({ anchor: "2026-05-17", granularity: "month" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/pnl-report?");
    expect(String(url)).toContain("anchor=2026-05-17");
    expect(String(url)).toContain("granularity=month");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Forbidden: missing permission" }), { status: 403, headers: { "content-type": "application/json" } })),
    );
    await expect(fetchPnlReport({ anchor: "2026-05-17", granularity: "month" })).rejects.toThrow(/forbidden/i);
  });
});

describe("export links (AC3)", () => {
  it("builds CSV ('Excel') + PDF links carrying the same anchor/granularity", () => {
    const csv = pnlCsvHref({ anchor: "2026-05-17", granularity: "month" });
    expect(csv).toContain("/admin/pnl-report/export.csv");
    expect(csv).toContain("anchor=2026-05-17");
    expect(csv).toContain("granularity=month");

    const pdf = pnlPdfHref({ anchor: "2026-05-17", granularity: "year" });
    expect(pdf).toContain("/admin/pnl-report/export.pdf");
    expect(pdf).toContain("granularity=year");
  });
});

describe("anchor + granularity helpers", () => {
  it("defaults the anchor to today (YYYY-MM-DD)", () => {
    expect(defaultPnlAnchor(new Date("2026-05-17T12:00:00Z"))).toBe("2026-05-17");
  });

  it("validates the granularity", () => {
    expect(isValidPnlGranularity("month")).toBe(true);
    expect(isValidPnlGranularity("year")).toBe(true);
    expect(isValidPnlGranularity("week")).toBe(false);
  });
});
