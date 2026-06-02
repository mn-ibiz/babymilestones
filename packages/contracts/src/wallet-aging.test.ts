import { describe, expect, it } from "vitest";
import {
  walletAgingQuerySchema,
  WALLET_AGING_EXPORT_COLUMNS,
  walletAgingToCsv,
  walletAgingViewModel,
  walletAgingExportUrl,
  walletAgingFilename,
  walletAgingParentProfileHref,
  type WalletAgingReportDto,
} from "./index.js";

/**
 * P3-E05-S04 (Story 27.4) — wallet aging-report contracts: the optional `asOf`
 * query schema (reused by the API + export), the CSV serialiser (bucket header
 * rows + per-parent rows + escaping), the render-ready view-model with per-parent
 * profile hrefs (AC2), and the export URL + filename.
 */

function dto(over: Partial<WalletAgingReportDto> = {}): WalletAgingReportDto {
  return {
    asOf: "2026-06-02T00:00:00.000Z",
    buckets: [
      {
        key: "d0_7",
        label: "0–7 days",
        minDays: 0,
        maxDays: 7,
        rows: [
          { parentId: "p1", userId: "u1", parentName: "Pat Doe", amountCents: 1500 },
          { parentId: "p2", userId: "u2", parentName: "Ann, Bee", amountCents: 500 },
        ],
        totalCents: 2000,
      },
      { key: "d8_30", label: "8–30 days", minDays: 8, maxDays: 30, rows: [], totalCents: 0 },
      { key: "d31_60", label: "31–60 days", minDays: 31, maxDays: 60, rows: [], totalCents: 0 },
      { key: "d61_90", label: "61–90 days", minDays: 61, maxDays: 90, rows: [], totalCents: 0 },
      {
        key: "d90_plus",
        label: "90+ days",
        minDays: 91,
        maxDays: null,
        rows: [{ parentId: "p3", userId: "u3", parentName: "Old Owe", amountCents: 10000 }],
        totalCents: 10000,
      },
    ],
    totalCents: 12000,
    ...over,
  };
}

describe("walletAgingQuerySchema", () => {
  it("accepts an empty query (asOf optional → defaults server-side)", () => {
    const parsed = walletAgingQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid asOf date", () => {
    const parsed = walletAgingQuerySchema.safeParse({ asOf: "2026-06-02" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.asOf).toBe("2026-06-02");
  });

  it("rejects a malformed asOf", () => {
    expect(walletAgingQuerySchema.safeParse({ asOf: "not-a-date" }).success).toBe(false);
  });
});

describe("walletAgingToCsv (AC3)", () => {
  it("emits the column header, a bucket header row, and per-parent rows", () => {
    const csv = walletAgingToCsv(dto());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(WALLET_AGING_EXPORT_COLUMNS.join(","));
    // The 0–7 bucket then its parent row, amount rendered as a KES decimal.
    expect(csv).toContain("0–7 days,Pat Doe,15.00");
  });

  it("RFC-4180 escapes a parent name containing a comma (AC3)", () => {
    const csv = walletAgingToCsv(dto());
    expect(csv).toContain('"Ann, Bee"');
  });

  it("includes the 90+ bucket row and a grand total", () => {
    const csv = walletAgingToCsv(dto());
    expect(csv).toContain("90+ days,Old Owe,");
    expect(csv).toContain("100.00");
    expect(csv).toContain("Total,,120.00");
  });

  it("ends with a trailing CRLF", () => {
    expect(walletAgingToCsv(dto()).endsWith("\r\n")).toBe(true);
  });
});

describe("walletAgingViewModel (AC2)", () => {
  it("renders each bucket with per-parent rows carrying a profile href", () => {
    const vm = walletAgingViewModel(dto());
    const first = vm.buckets.find((b) => b.key === "d0_7")!;
    expect(first.label).toBe("0–7 days");
    expect(first.rows[0]).toMatchObject({
      parentName: "Pat Doe",
      amount: "KES 15.00",
      href: walletAgingParentProfileHref("u1"),
    });
    expect(first.total).toBe("KES 20.00");
  });

  it("always surfaces all five buckets in order", () => {
    const vm = walletAgingViewModel(dto());
    expect(vm.buckets.map((b) => b.key)).toEqual(["d0_7", "d8_30", "d31_60", "d61_90", "d90_plus"]);
  });

  it("links each row to /parents/:userId/statement (AC2)", () => {
    expect(walletAgingParentProfileHref("u-99")).toBe("/parents/u-99/statement");
  });
});

describe("walletAgingExportUrl / walletAgingFilename", () => {
  it("export url carries asOf when set", () => {
    expect(walletAgingExportUrl({ asOf: "2026-06-02" })).toBe(
      "/admin/wallet-aging/export?asOf=2026-06-02",
    );
  });

  it("export url omits asOf when absent", () => {
    expect(walletAgingExportUrl({})).toBe("/admin/wallet-aging/export");
  });

  it("filename embeds the as-of date", () => {
    expect(walletAgingFilename({ asOf: "2026-06-02" })).toBe("wallet_aging_2026-06-02.csv");
  });
});
