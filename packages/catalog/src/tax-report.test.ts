import { describe, expect, it } from "vitest";
import {
  aggregateTaxReport,
  monthsInRange,
  type TaxLineInput,
} from "./tax-report.js";

/**
 * P6-E07-S06 (Story 35.6) — Tax-ready exports (pure reducer).
 *
 * AC1: per-period TAXABLE SUPPLIES, VAT CHARGED, EXEMPT SUPPLIES (+ total).
 *
 * The reducer is pure: it is handed each settled receipt line as
 * `{ netCents, taxCents, vatable }` (the DB layer derives `vatable` from the
 * stored line tax / tax treatment) and buckets it. A VATable line contributes its
 * NET to taxable supplies and its TAX to VAT charged; a non-VATable (exempt /
 * zero-rated) line contributes its net to exempt supplies. Total supplies =
 * taxable + exempt (net of VAT, the value of goods/services supplied).
 */

function line(over: Partial<TaxLineInput> = {}): TaxLineInput {
  return { netCents: 0, taxCents: 0, vatable: false, ...over };
}

describe("aggregateTaxReport (AC1)", () => {
  it("splits taxable vs exempt and sums the VAT for a mixed period", () => {
    const out = aggregateTaxReport({
      from: "2026-05-01",
      to: "2026-06-01",
      lines: [
        // VATable: net 100.00 + VAT 16.00
        line({ netCents: 100_00, taxCents: 16_00, vatable: true }),
        // VATable: net 50.00 + VAT 8.00
        line({ netCents: 50_00, taxCents: 8_00, vatable: true }),
        // Exempt: net 30.00, no VAT
        line({ netCents: 30_00, taxCents: 0, vatable: false }),
        // Zero-rated (treated as exempt-of-VAT here): net 20.00, no VAT
        line({ netCents: 20_00, taxCents: 0, vatable: false }),
      ],
    });

    expect(out.from).toBe("2026-05-01");
    expect(out.to).toBe("2026-06-01");
    expect(out.taxableSuppliesCents).toBe(150_00);
    expect(out.vatChargedCents).toBe(24_00);
    expect(out.exemptSuppliesCents).toBe(50_00);
    // Total supplies = taxable + exempt (net of VAT).
    expect(out.totalSuppliesCents).toBe(200_00);
  });

  it("zero data → all zeros", () => {
    const out = aggregateTaxReport({ from: "2026-05-01", to: "2026-06-01", lines: [] });
    expect(out.taxableSuppliesCents).toBe(0);
    expect(out.vatChargedCents).toBe(0);
    expect(out.exemptSuppliesCents).toBe(0);
    expect(out.totalSuppliesCents).toBe(0);
  });

  it("a VATable line contributes net to taxable and tax to VAT (not to exempt)", () => {
    const out = aggregateTaxReport({
      from: "2026-05-01",
      to: "2026-06-01",
      lines: [line({ netCents: 200_00, taxCents: 32_00, vatable: true })],
    });
    expect(out.taxableSuppliesCents).toBe(200_00);
    expect(out.vatChargedCents).toBe(32_00);
    expect(out.exemptSuppliesCents).toBe(0);
    expect(out.totalSuppliesCents).toBe(200_00);
  });

  it("an exempt line contributes net to exempt and nothing to VAT", () => {
    const out = aggregateTaxReport({
      from: "2026-05-01",
      to: "2026-06-01",
      lines: [line({ netCents: 75_00, taxCents: 0, vatable: false })],
    });
    expect(out.taxableSuppliesCents).toBe(0);
    expect(out.vatChargedCents).toBe(0);
    expect(out.exemptSuppliesCents).toBe(75_00);
    expect(out.totalSuppliesCents).toBe(75_00);
  });

  it("produces a per-month breakdown when months are supplied", () => {
    const out = aggregateTaxReport({
      from: "2026-04-01",
      to: "2026-06-01",
      months: ["2026-04", "2026-05"],
      lines: [
        line({ month: "2026-04", netCents: 100_00, taxCents: 16_00, vatable: true }),
        line({ month: "2026-05", netCents: 40_00, taxCents: 0, vatable: false }),
        line({ month: "2026-05", netCents: 60_00, taxCents: 9_60, vatable: true }),
      ],
    });

    expect(out.byMonth).toBeDefined();
    expect(out.byMonth!.map((m) => m.month)).toEqual(["2026-04", "2026-05"]);

    const apr = out.byMonth!.find((m) => m.month === "2026-04")!;
    expect(apr.taxableSuppliesCents).toBe(100_00);
    expect(apr.vatChargedCents).toBe(16_00);
    expect(apr.exemptSuppliesCents).toBe(0);

    const may = out.byMonth!.find((m) => m.month === "2026-05")!;
    expect(may.taxableSuppliesCents).toBe(60_00);
    expect(may.vatChargedCents).toBe(9_60);
    expect(may.exemptSuppliesCents).toBe(40_00);

    // The whole-period totals still reconcile against the months.
    expect(out.taxableSuppliesCents).toBe(160_00);
    expect(out.vatChargedCents).toBe(25_60);
    expect(out.exemptSuppliesCents).toBe(40_00);
  });

  it("zero-fills months that have no lines", () => {
    const out = aggregateTaxReport({
      from: "2026-04-01",
      to: "2026-06-01",
      months: ["2026-04", "2026-05"],
      lines: [line({ month: "2026-05", netCents: 10_00, taxCents: 1_60, vatable: true })],
    });
    const apr = out.byMonth!.find((m) => m.month === "2026-04")!;
    expect(apr.taxableSuppliesCents).toBe(0);
    expect(apr.vatChargedCents).toBe(0);
    expect(apr.exemptSuppliesCents).toBe(0);
    expect(apr.totalSuppliesCents).toBe(0);
  });

  it("omits the breakdown when no months are supplied", () => {
    const out = aggregateTaxReport({ from: "2026-05-01", to: "2026-06-01", lines: [] });
    expect(out.byMonth).toBeUndefined();
  });
});

describe("monthsInRange", () => {
  it("lists each YYYY-MM in a half-open [from, to) range", () => {
    expect(monthsInRange("2026-01-01", "2026-04-01")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("handles a single-month range", () => {
    expect(monthsInRange("2026-05-01", "2026-06-01")).toEqual(["2026-05"]);
  });

  it("crosses a year boundary", () => {
    expect(monthsInRange("2025-11-01", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("an empty range yields no months", () => {
    expect(monthsInRange("2026-05-01", "2026-05-01")).toEqual([]);
  });
});
