import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_REFRESH_MS,
  fetchOperationsDashboard,
  operationsRevenueByUnit,
  operationsTiles,
  operationsTopStaff,
  type OperationsDashboard,
} from "./operations-dashboard";

/**
 * P3-E05-S01 (Story 27.1) — admin operations-dashboard client logic. Framework-
 * free so it unit-tests without React: the read seam over the admin-gated
 * `/admin/operations-dashboard` API, the tile / drill-down view-models
 * (re-exported from `@bm/contracts`), and the 60s auto-refresh interval (AC3).
 */

function dashboard(over: Partial<OperationsDashboard> = {}): OperationsDashboard {
  return {
    date: "2026-06-15",
    revenue: {
      totalCents: 12_500,
      byUnit: [
        { unit: "play", revenueCents: 5000 },
        { unit: "talent", revenueCents: 0 },
        { unit: "salon", revenueCents: 7500 },
        { unit: "coaching", revenueCents: 0 },
        { unit: "event", revenueCents: 0 },
      ],
    },
    bookingsCount: 4,
    activeSessions: 2,
    outstandingCents: 30_000,
    topStaff: [{ staffId: "s1", staffName: "Asha", bookings: 2, revenueCents: 7500 }],
    ...over,
  };
}

describe("fetchOperationsDashboard (Story 27.1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the dashboard from the admin endpoint (credentialed)", async () => {
    const dto = dashboard();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchOperationsDashboard();
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/operations-dashboard");
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
    await expect(fetchOperationsDashboard()).rejects.toThrow(/forbidden/i);
  });
});

describe("operations dashboard view-models (AC1/AC2)", () => {
  it("shapes the five tiles, each with a drill-down href (AC1/AC2)", () => {
    const vm = operationsTiles(dashboard());
    const byKey = Object.fromEntries(vm.tiles.map((t) => [t.key, t]));
    expect(byKey.revenue).toMatchObject({ label: "Today's revenue", value: "KES 125.00" });
    expect(byKey.bookings!.value).toBe("4");
    expect(byKey.activeSessions!.value).toBe("2");
    expect(byKey.outstanding!.value).toBe("KES 300.00");
    expect(byKey.topStaff!.value).toBe("Asha");
    for (const t of vm.tiles) expect(t.href.startsWith("/")).toBe(true);
  });

  it("breaks revenue down per unit with drill-down links (AC1/AC2)", () => {
    const rows = operationsRevenueByUnit(dashboard());
    expect(rows.find((r) => r.unit === "salon")).toMatchObject({ value: "KES 75.00", href: "/salon-report" });
    expect(rows.find((r) => r.unit === "play")).toMatchObject({ value: "KES 50.00", href: "/operations/revenue?unit=play" });
  });

  it("shapes the top-staff drill-down rows (AC1/AC2)", () => {
    const rows = operationsTopStaff(dashboard());
    expect(rows).toEqual([
      { staffId: "s1", staffName: "Asha", bookings: "2", revenue: "KES 75.00", href: "/staff-earnings" },
    ]);
  });
});

describe("auto-refresh interval (AC3)", () => {
  it("polls every 60 seconds", () => {
    expect(DASHBOARD_REFRESH_MS).toBe(60_000);
  });
});
