import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPeakHoursHeatmap,
  heatmapTiles,
  defaultHeatmapRange,
  isValidHeatmapRange,
  type PeakHoursHeatmap,
} from "./peak-hours-heatmap";

/**
 * P3-E05-S05 (Story 27.5) — admin peak-hours-heatmap client logic. Framework-free
 * so it unit-tests without React: the read seam over the admin-gated
 * `/admin/peak-hours-heatmap` API (date-range + unit filter), the grid view-model
 * (re-exported from `@bm/contracts`), and the range/validation helpers (12-month
 * cap, AC3).
 */

function report(over: Partial<PeakHoursHeatmap> = {}): PeakHoursHeatmap {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  cells[3]![10] = 4;
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    unit: null,
    cells,
    totalSessions: 4,
    peak: { weekday: 3, hour: 10, count: 4 },
    ...over,
  };
}

describe("fetchPeakHoursHeatmap (Story 27.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the heatmap from the admin endpoint with the range + unit filter (credentialed)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPeakHoursHeatmap({ fromDate: "2026-06-01", toDate: "2026-06-07", unit: "salon" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/peak-hours-heatmap?");
    expect(String(url)).toContain("fromDate=2026-06-01");
    expect(String(url)).toContain("toDate=2026-06-07");
    expect(String(url)).toContain("unit=salon");
    expect(init?.credentials).toBe("include");
  });

  it("omits the unit param when no unit is selected (all units)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(report()), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchPeakHoursHeatmap({ fromDate: "2026-06-01", toDate: "2026-06-07", unit: "" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("unit=");
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
    await expect(
      fetchPeakHoursHeatmap({ fromDate: "2026-06-01", toDate: "2026-06-07", unit: "" }),
    ).rejects.toThrow(/forbidden/i);
  });
});

describe("heatmap view-model (AC1)", () => {
  it("builds a 7×24 render-ready grid (AC1)", () => {
    const vm = heatmapTiles(report());
    expect(vm.rows).toHaveLength(7);
    expect(vm.rows[3]!.cells[10]!.count).toBe(4);
    expect(vm.rows[3]!.cells[10]!.intensity).toBeGreaterThan(0);
    expect(vm.peakLabel).toContain("Wed");
  });
});

describe("range helpers (AC3)", () => {
  it("defaults to a 30-day range ending today (inclusive)", () => {
    const r = defaultHeatmapRange(new Date("2026-06-30T12:00:00Z"));
    expect(r.toDate).toBe("2026-06-30");
    expect(r.fromDate).toBe("2026-06-01");
    expect(r.unit).toBe("");
  });

  it("validates fromDate <= toDate and the 12-month cap (AC3)", () => {
    expect(isValidHeatmapRange({ fromDate: "2026-06-01", toDate: "2026-06-07", unit: "" })).toBe(true);
    expect(isValidHeatmapRange({ fromDate: "2026-06-08", toDate: "2026-06-01", unit: "" })).toBe(false);
    // > 12 months rejected.
    expect(isValidHeatmapRange({ fromDate: "2025-06-01", toDate: "2026-06-02", unit: "" })).toBe(false);
    // Exactly 12 months allowed.
    expect(isValidHeatmapRange({ fromDate: "2025-06-02", toDate: "2026-06-02", unit: "" })).toBe(true);
  });
});
