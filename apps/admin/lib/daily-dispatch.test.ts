import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyDispatch,
  dispatchTiles,
  dispatchExportHref,
  defaultDispatchDate,
  isValidDispatchDate,
  type DailyDispatchReport,
} from "./daily-dispatch";

/**
 * P4-E04-S04 (Story 29.4) — admin daily dispatch client logic. Framework-free so it
 * unit-tests without React: the read seam over the admin-gated `/admin/daily-dispatch`
 * API (date filter, defaults to today — AC4), the table view-model (re-exported from
 * `@bm/contracts`), and the CSV export link (AC3).
 */

function report(over: Partial<DailyDispatchReport> = {}): DailyDispatchReport {
  return {
    date: "2026-06-02",
    countsByStatus: [
      { status: "new", count: 2 },
      { status: "packing", count: 1 },
      { status: "ready", count: 0 },
      { status: "dispatched", count: 3 },
      { status: "fulfilled", count: 4 },
      { status: "cancelled", count: 1 },
    ],
    totalOrders: 11,
    totalValueCents: 1_234_56,
    avgPackSeconds: 900,
    avgDispatchSeconds: 1200,
    syncHealthCount: 2,
    ...over,
  };
}

describe("fetchDailyDispatch (Story 29.4)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the report from the admin endpoint with the date filter (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchDailyDispatch("2026-06-02");
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/daily-dispatch?");
    expect(String(url)).toContain("date=2026-06-02");
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
    await expect(fetchDailyDispatch("2026-06-02")).rejects.toThrow(/forbidden/i);
  });
});

describe("dispatch view-model + export link (AC2/AC3/AC5)", () => {
  it("builds the status table + formatted figures + dead-letter link", () => {
    const vm = dispatchTiles(report());
    expect(vm.totalValue).toBe("KES 1234.56");
    expect(vm.avgPack).toBe("15.0 min");
    expect(vm.syncHealth.count).toBe(2);
    expect(vm.syncHealth.href).toBe("/woocommerce-sync");
  });

  it("builds the CSV export link carrying the date (AC3)", () => {
    const href = dispatchExportHref("2026-06-02");
    expect(href).toContain("/admin/daily-dispatch/export");
    expect(href).toContain("date=2026-06-02");
  });
});

describe("date helpers (AC4)", () => {
  it("defaults to today", () => {
    expect(defaultDispatchDate(new Date("2026-06-14T12:00:00Z"))).toBe("2026-06-14");
  });

  it("validates the date format", () => {
    expect(isValidDispatchDate("2026-06-02")).toBe(true);
    expect(isValidDispatchDate("02-06-2026")).toBe(false);
    expect(isValidDispatchDate("")).toBe(false);
  });
});
