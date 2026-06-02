import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSalonReport,
  salonReportTile,
  salonReportStylists,
  type SalonDayReport,
} from "./salon-report";

/**
 * P3-E03-S05 (Story 25.5) — admin salon-report client logic. Framework-free so it
 * unit-tests without React: the read seam over the admin-gated
 * `/admin/salon-report` API and the tile / drill-down view-models (re-exported
 * from `@bm/contracts` so the dashboard, Epic 27, reuses the same shaping).
 */

function report(over: Partial<SalonDayReport> = {}): SalonDayReport {
  return {
    date: "2026-06-15",
    bookings: 3,
    noShows: 1,
    revenueCents: 7500,
    stylists: [
      { staffId: "asha", staffName: "Asha", bookings: 2, noShows: 1, revenueCents: 5000 },
      { staffId: "bree", staffName: "Bree", bookings: 1, noShows: 0, revenueCents: 2500 },
    ],
    ...over,
  };
}

describe("fetchSalonReport (Story 25.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report for a date from the admin endpoint (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchSalonReport("2026-06-15");
    expect(out).toEqual(dto);
    // Hits the admin endpoint with the date and sends credentials.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/salon-report?date=2026-06-15");
    expect(init?.credentials).toBe("include");
  });

  it("omits the date param when none is given (defaults to server clock)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(report()), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchSalonReport();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/admin/salon-report");
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("date=");
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
    await expect(fetchSalonReport("2026-06-15")).rejects.toThrow(/forbidden/i);
  });
});

describe("salon report view-models (AC1/AC2)", () => {
  it("shapes the headline tile (AC1)", () => {
    const tile = salonReportTile(report());
    expect(tile.stats).toEqual([
      { label: "Bookings", value: "3" },
      { label: "No-shows", value: "1" },
      { label: "Revenue", value: "KES 75.00" },
    ]);
    expect(tile.isEmpty).toBe(false);
  });

  it("shapes the per-stylist drill-down (AC2)", () => {
    const rows = salonReportStylists(report());
    expect(rows).toEqual([
      { staffId: "asha", staffName: "Asha", bookings: "2", noShows: "1", revenue: "KES 50.00" },
      { staffId: "bree", staffName: "Bree", bookings: "1", noShows: "0", revenue: "KES 25.00" },
    ]);
  });

  it("flags an empty day", () => {
    expect(salonReportTile(report({ bookings: 0, noShows: 0, revenueCents: 0, stylists: [] })).isEmpty).toBe(true);
  });
});
