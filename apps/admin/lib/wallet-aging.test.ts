import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchWalletAging,
  walletAgingTiles,
  walletAgingExportHref,
  walletAgingProfileHref,
  type WalletAgingReport,
} from "./wallet-aging";

/**
 * P3-E05-S04 (Story 27.4) — admin wallet-aging client logic. Reads the admin-gated
 * `/admin/wallet-aging` API (credentialed), shapes the report into render-ready
 * buckets + per-parent rows with profile hrefs (AC2), and builds the CSV export
 * link with the same optional `asOf` filter (AC3).
 */
function report(): WalletAgingReport {
  return {
    asOf: "2026-06-02T00:00:00.000Z",
    buckets: [
      {
        key: "d0_7",
        label: "0–7 days",
        minDays: 0,
        maxDays: 7,
        rows: [{ parentId: "p1", userId: "u1", parentName: "Pat Doe", amountCents: 1500 }],
        totalCents: 1500,
      },
      { key: "d8_30", label: "8–30 days", minDays: 8, maxDays: 30, rows: [], totalCents: 0 },
      { key: "d31_60", label: "31–60 days", minDays: 31, maxDays: 60, rows: [], totalCents: 0 },
      { key: "d61_90", label: "61–90 days", minDays: 61, maxDays: 90, rows: [], totalCents: 0 },
      { key: "d90_plus", label: "90+ days", minDays: 91, maxDays: null, rows: [], totalCents: 0 },
    ],
    totalCents: 1500,
  };
}

describe("walletAgingTiles", () => {
  it("shapes buckets with per-parent rows carrying a profile href (AC2)", () => {
    const vm = walletAgingTiles(report());
    const first = vm.buckets.find((b) => b.key === "d0_7")!;
    expect(first.rows[0]).toMatchObject({
      parentName: "Pat Doe",
      amount: "KES 15.00",
      href: walletAgingProfileHref("u1"),
    });
  });

  it("links each row to /parents/:userId/statement (AC2)", () => {
    expect(walletAgingProfileHref("u-7")).toBe("/parents/u-7/statement");
  });
});

describe("walletAgingExportHref (AC3)", () => {
  it("carries the asOf when set", () => {
    expect(walletAgingExportHref({ asOf: "2026-06-02" })).toContain(
      "/admin/wallet-aging/export?asOf=2026-06-02",
    );
  });
  it("omits asOf when absent", () => {
    expect(walletAgingExportHref({})).toContain("/admin/wallet-aging/export");
    expect(walletAgingExportHref({})).not.toContain("?asOf");
  });
});

describe("fetchWalletAging", () => {
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

    const out = await fetchWalletAging({});
    expect(out.totalCents).toBe(1500);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/wallet-aging"),
      expect.objectContaining({ credentials: "include" }),
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
    await expect(fetchWalletAging({})).rejects.toThrow("Forbidden");
  });
});
