import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchFloatVsRevenue,
  floatVsRevenueTiles,
  type FloatVsRevenue,
} from "./float-vs-revenue";

/**
 * P5-E05-S04 (Story 35.4) — admin float-vs-revenue client logic. Reads the
 * admin-gated `/admin/float-vs-revenue` API (credentialed), shapes the report into
 * render-ready snapshot KPIs (AC1) + the 90-day chart series (AC2).
 */
function report(): FloatVsRevenue {
  return {
    from: "2026-06-01",
    to: "2026-06-02",
    snapshot: {
      date: "2026-06-02",
      walletLiabilityCents: 62_000,
      segregatedBalanceCents: 60_000,
      revenueCents: 3_500,
      priorDayDeltaCents: 12_000,
    },
    series: [
      { date: "2026-06-01", walletLiabilityCents: 50_000, segregatedBalanceCents: 48_000, revenueCents: 1_000, priorDayDeltaCents: 50_000 },
      { date: "2026-06-02", walletLiabilityCents: 62_000, segregatedBalanceCents: 60_000, revenueCents: 3_500, priorDayDeltaCents: 12_000 },
    ],
  };
}

describe("floatVsRevenueTiles", () => {
  it("formats the snapshot KPIs with a signed prior-day delta (AC1)", () => {
    const vm = floatVsRevenueTiles(report());
    expect(vm.snapshot.walletLiability).toBe("KES 620.00");
    expect(vm.snapshot.segregatedBalance).toBe("KES 600.00");
    expect(vm.snapshot.revenue).toBe("KES 35.00");
    expect(vm.snapshot.priorDayDelta).toBe("+KES 120.00");
    expect(vm.snapshot.priorDayDeltaDirection).toBe("up");
  });

  it("exposes the chart series (AC2)", () => {
    const vm = floatVsRevenueTiles(report());
    expect(vm.series).toHaveLength(2);
    expect(vm.series[1]!.walletLiability).toBe("KES 620.00");
  });
});

describe("fetchFloatVsRevenue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests the admin endpoint credentialed and returns the report", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => report(),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchFloatVsRevenue({});
    expect(out.snapshot.walletLiabilityCents).toBe(62_000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/float-vs-revenue"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("carries a custom window length when set", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => report(),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    await fetchFloatVsRevenue({ days: 30 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("days=30"),
      expect.anything(),
    );
  });

  it("throws the server error message on a non-2xx (e.g. 403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden: missing permission" }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchFloatVsRevenue({})).rejects.toThrow("Forbidden");
  });
});
