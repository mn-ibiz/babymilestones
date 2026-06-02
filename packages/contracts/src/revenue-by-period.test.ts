import { describe, expect, it } from "vitest";
import {
  revenueByPeriodQuerySchema,
  REVENUE_BY_PERIOD_EXPORT_COLUMNS,
  revenueByPeriodToCsv,
  revenueByPeriodViewModel,
  revenueByPeriodExportUrl,
  revenueByPeriodFilename,
  type RevenueByPeriodDto,
} from "./index.js";

/**
 * P3-E05-S02 (Story 27.2) — revenue-by-unit-by-period contracts: the date-range
 * query schema (reused by the API + the page picker), the CSV serialiser (header +
 * per-unit rows + a TOTAL row, same filter), and the chart/delta view-model.
 */

function dto(over: Partial<RevenueByPeriodDto> = {}): RevenueByPeriodDto {
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

describe("revenueByPeriodQuerySchema (Story 27.2 AC1)", () => {
  it("accepts a valid inclusive range", () => {
    expect(revenueByPeriodQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-07" }).success).toBe(true);
  });

  it("rejects fromDate after toDate", () => {
    const r = revenueByPeriodQuerySchema.safeParse({ fromDate: "2026-06-08", toDate: "2026-06-01" });
    expect(r.success).toBe(false);
  });

  it("accepts a single-day range", () => {
    expect(revenueByPeriodQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-06-01" }).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(revenueByPeriodQuerySchema.safeParse({ fromDate: "01-06-2026", toDate: "2026-06-07" }).success).toBe(false);
  });
});

describe("revenueByPeriodToCsv (Story 27.2 AC2/AC3)", () => {
  it("emits a header then one NET-revenue row per unit + a TOTAL row", () => {
    const csv = revenueByPeriodToCsv(dto());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(REVENUE_BY_PERIOD_EXPORT_COLUMNS.join(","));
    expect(lines[0]).toBe("unit,revenue_kes,previous_revenue_kes,delta_kes");
    // Per-unit rows are net revenue (refunds already excluded upstream).
    expect(lines[1]).toBe("Play,35.00,10.00,25.00");
    expect(lines[3]).toBe("Salon,40.00,80.00,-40.00");
    // A TOTAL row closes the file.
    expect(lines).toContain("Total,75.00,90.00,-15.00");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("emits header + TOTAL only for an all-zero period", () => {
    const csv = revenueByPeriodToCsv(
      dto({
        byUnit: [
          { unit: "play", revenueCents: 0 },
          { unit: "talent", revenueCents: 0 },
          { unit: "salon", revenueCents: 0 },
          { unit: "coaching", revenueCents: 0 },
          { unit: "event", revenueCents: 0 },
        ],
        totalCents: 0,
        previousByUnit: [
          { unit: "play", revenueCents: 0 },
          { unit: "talent", revenueCents: 0 },
          { unit: "salon", revenueCents: 0 },
          { unit: "coaching", revenueCents: 0 },
          { unit: "event", revenueCents: 0 },
        ],
        previousTotalCents: 0,
        deltaByUnit: [
          { unit: "play", deltaCents: 0 },
          { unit: "talent", deltaCents: 0 },
          { unit: "salon", deltaCents: 0 },
          { unit: "coaching", deltaCents: 0 },
          { unit: "event", deltaCents: 0 },
        ],
        totalDeltaCents: 0,
      }),
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("unit,revenue_kes,previous_revenue_kes,delta_kes");
    expect(lines).toContain("Total,0.00,0.00,0.00");
    expect(lines.filter((l) => l.startsWith("Play"))[0]).toBe("Play,0.00,0.00,0.00");
  });
});

describe("revenueByPeriodViewModel (Story 27.2 AC1)", () => {
  it("builds a chart-ready series + formatted delta per unit and total", () => {
    const vm = revenueByPeriodViewModel(dto());
    expect(vm.from).toBe("2026-06-01");
    expect(vm.to).toBe("2026-06-07");
    // Chart series: every unit present, with formatted value + raw cents.
    const play = vm.series.find((s) => s.unit === "play")!;
    expect(play.label).toBe("Play");
    expect(play.value).toBe("KES 35.00");
    expect(play.revenueCents).toBe(3500);
    expect(play.deltaValue).toBe("+KES 25.00"); // growth sign
    expect(play.deltaDirection).toBe("up");
    const salon = vm.series.find((s) => s.unit === "salon")!;
    expect(salon.deltaValue).toBe("-KES 40.00");
    expect(salon.deltaDirection).toBe("down");
    const talent = vm.series.find((s) => s.unit === "talent")!;
    expect(talent.deltaDirection).toBe("flat");
    // Totals.
    expect(vm.total.value).toBe("KES 75.00");
    expect(vm.total.previousValue).toBe("KES 90.00");
    expect(vm.total.deltaValue).toBe("-KES 15.00");
    expect(vm.total.deltaDirection).toBe("down");
  });
});

describe("revenue export url + filename (Story 27.2 AC2)", () => {
  it("carries the same date-range filter on the export URL", () => {
    const url = revenueByPeriodExportUrl({ fromDate: "2026-06-01", toDate: "2026-06-07" });
    expect(url).toContain("/admin/revenue-by-period/export");
    expect(url).toContain("fromDate=2026-06-01");
    expect(url).toContain("toDate=2026-06-07");
  });

  it("names the download for the range", () => {
    expect(revenueByPeriodFilename({ fromDate: "2026-06-01", toDate: "2026-06-07" })).toBe(
      "revenue_by_unit_2026-06-01_to_2026-06-07.csv",
    );
  });
});
