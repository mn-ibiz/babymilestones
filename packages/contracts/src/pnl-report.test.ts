import { describe, expect, it } from "vitest";
import {
  PNL_UNITS,
  pnlUnitLabel,
  pnlReportQuerySchema,
  pnlReportToCsv,
  pnlReportToPrintableHtml,
  pnlReportCsvFilename,
  pnlReportPdfFilename,
  PNL_EXPORT_COLUMNS,
  type PnlComparisonDto,
} from "./index.js";

/**
 * P6-E05-S01 (Story 35.1) — Consolidated P&L contracts: query schema, the wire
 * DTO, and the CSV ("Excel") + printable-HTML ("PDF") export renderers.
 */

const SAMPLE: PnlComparisonDto = {
  granularity: "month",
  current: {
    from: "2026-05-01",
    to: "2026-06-01",
    byUnit: [
      { unit: "play", revenueCents: 100_00, directCostsCents: 0, expensesCents: 30_00, netCents: 70_00 },
      { unit: "talent", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "salon", revenueCents: 50_00, directCostsCents: 0, expensesCents: 0, netCents: 50_00 },
      { unit: "coaching", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "event", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "shop", revenueCents: 0, directCostsCents: 0, expensesCents: 5_00, netCents: -5_00 },
    ],
    totals: {
      revenueCents: 150_00,
      directCostsCents: 0,
      expensesCents: 35_00,
      sharedOverheadCents: 10_00,
      netCents: 105_00,
    },
  },
  previous: {
    from: "2026-04-01",
    to: "2026-05-01",
    byUnit: [
      { unit: "play", revenueCents: 60_00, directCostsCents: 0, expensesCents: 20_00, netCents: 40_00 },
      { unit: "talent", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "salon", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "coaching", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "event", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
      { unit: "shop", revenueCents: 0, directCostsCents: 0, expensesCents: 0, netCents: 0 },
    ],
    totals: {
      revenueCents: 60_00,
      directCostsCents: 0,
      expensesCents: 20_00,
      sharedOverheadCents: 10_00,
      netCents: 30_00,
    },
  },
  deltaByUnit: [
    { unit: "play", revenueDeltaCents: 40_00, directCostsDeltaCents: 0, expensesDeltaCents: 10_00, netDeltaCents: 30_00 },
    { unit: "talent", revenueDeltaCents: 0, directCostsDeltaCents: 0, expensesDeltaCents: 0, netDeltaCents: 0 },
    { unit: "salon", revenueDeltaCents: 50_00, directCostsDeltaCents: 0, expensesDeltaCents: 0, netDeltaCents: 50_00 },
    { unit: "coaching", revenueDeltaCents: 0, directCostsDeltaCents: 0, expensesDeltaCents: 0, netDeltaCents: 0 },
    { unit: "event", revenueDeltaCents: 0, directCostsDeltaCents: 0, expensesDeltaCents: 0, netDeltaCents: 0 },
    { unit: "shop", revenueDeltaCents: 0, directCostsDeltaCents: 0, expensesDeltaCents: 5_00, netDeltaCents: -5_00 },
  ],
  totalsDelta: {
    revenueDeltaCents: 90_00,
    directCostsDeltaCents: 0,
    expensesDeltaCents: 15_00,
    sharedOverheadDeltaCents: 0,
    netDeltaCents: 75_00,
  },
};

describe("pnlReportQuerySchema", () => {
  it("accepts a valid anchor + granularity", () => {
    const ok = pnlReportQuerySchema.safeParse({ anchor: "2026-05-17", granularity: "month" });
    expect(ok.success).toBe(true);
  });

  it("defaults granularity to month when omitted", () => {
    const parsed = pnlReportQuerySchema.parse({ anchor: "2026-05-17" });
    expect(parsed.granularity).toBe("month");
  });

  it("rejects an unknown granularity", () => {
    expect(pnlReportQuerySchema.safeParse({ anchor: "2026-05-17", granularity: "week" }).success).toBe(false);
  });

  it("rejects a malformed anchor date", () => {
    expect(pnlReportQuerySchema.safeParse({ anchor: "2026/05/17", granularity: "month" }).success).toBe(false);
  });
});

describe("pnlUnitLabel", () => {
  it("labels every P&L unit including shop", () => {
    expect(pnlUnitLabel("play")).toBe("Play");
    expect(pnlUnitLabel("shop")).toBe("Retail shop");
    for (const u of PNL_UNITS) expect(pnlUnitLabel(u).length).toBeGreaterThan(0);
  });
});

describe("pnlReportToCsv (AC3 — Excel)", () => {
  it("has a header row + one row per unit + total + shared-overhead + net lines", () => {
    const csv = pnlReportToCsv(SAMPLE);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(PNL_EXPORT_COLUMNS.join(","));
    // 6 units + Subtotal + Shared overhead + Consolidated net = 9 data lines.
    expect(lines).toHaveLength(1 + 6 + 3);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders cents as KES decimals and includes the prior + delta columns", () => {
    const csv = pnlReportToCsv(SAMPLE);
    // play: revenue 100.00, expenses 30.00, net 70.00; prior net 40.00; delta 30.00
    expect(csv).toContain("Play,100.00,0.00,30.00,70.00,40.00,30.00");
  });

  it("includes a shared-overhead line and a consolidated-net line", () => {
    const csv = pnlReportToCsv(SAMPLE);
    expect(csv).toContain("Shared overhead");
    expect(csv).toContain("Consolidated net");
  });
});

describe("pnlReportToPrintableHtml (AC3 — PDF via browser print)", () => {
  it("returns a self-contained HTML document with the period + a table", () => {
    const html = pnlReportToPrintableHtml(SAMPLE);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Consolidated P&amp;L");
    expect(html).toContain("2026-05-01");
    expect(html).toContain("<table");
    // Per-unit + totals rendered.
    expect(html).toContain("Play");
    expect(html).toContain("Retail shop");
    expect(html).toContain("Consolidated net");
  });

  it("escapes HTML-special characters (no injection)", () => {
    const html = pnlReportToPrintableHtml(SAMPLE);
    // The literal ampersand in "P&L" must be entity-escaped.
    expect(html).not.toMatch(/P&L/);
    expect(html).toContain("P&amp;L");
  });

  it("documents the GRN/COGS direct-costs limitation in the rendered doc", () => {
    const html = pnlReportToPrintableHtml(SAMPLE);
    expect(html.toLowerCase()).toContain("direct cost");
  });
});

describe("export filenames", () => {
  it("derive a csv + pdf filename from the period", () => {
    expect(pnlReportCsvFilename(SAMPLE)).toBe("pnl_2026-05-01_month.csv");
    expect(pnlReportPdfFilename(SAMPLE)).toBe("pnl_2026-05-01_month.html");
  });
});
