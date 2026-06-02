import { describe, expect, it } from "vitest";
import {
  taxReportQuerySchema,
  taxReportToCsv,
  taxReportToPrintableHtml,
  taxReportCsvFilename,
  taxReportPdfFilename,
  taxReportExportUrl,
  TAX_REPORT_EXPORT_COLUMNS,
  type TaxReportDto,
} from "./index.js";

/**
 * P6-E07-S06 (Story 35.6) — Tax-ready export contracts: the query schema, the wire
 * DTO, and the CSV ("Excel") + printable-HTML ("PDF") export renderers (AC1/AC2).
 */

const SAMPLE: TaxReportDto = {
  fromDate: "2026-04-01",
  toDate: "2026-05-31",
  taxableSuppliesCents: 150_00,
  vatChargedCents: 24_00,
  exemptSuppliesCents: 50_00,
  totalSuppliesCents: 200_00,
  byMonth: [
    { month: "2026-04", taxableSuppliesCents: 100_00, vatChargedCents: 16_00, exemptSuppliesCents: 20_00, totalSuppliesCents: 120_00 },
    { month: "2026-05", taxableSuppliesCents: 50_00, vatChargedCents: 8_00, exemptSuppliesCents: 30_00, totalSuppliesCents: 80_00 },
  ],
};

describe("taxReportQuerySchema", () => {
  it("accepts a valid fromDate + toDate", () => {
    expect(taxReportQuerySchema.safeParse({ fromDate: "2026-04-01", toDate: "2026-05-31" }).success).toBe(true);
  });

  it("rejects fromDate after toDate", () => {
    expect(taxReportQuerySchema.safeParse({ fromDate: "2026-05-31", toDate: "2026-04-01" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(taxReportQuerySchema.safeParse({ fromDate: "2026/04/01", toDate: "2026-05-31" }).success).toBe(false);
  });
});

describe("taxReportToCsv (AC2 — Excel)", () => {
  it("has a header row, a per-month row each, and a Total row", () => {
    const csv = taxReportToCsv(SAMPLE);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(TAX_REPORT_EXPORT_COLUMNS.join(","));
    // header + 2 month rows + Total = 4 lines.
    expect(lines).toHaveLength(1 + 2 + 1);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("renders cents as KES decimals for taxable / VAT / exempt (AC1)", () => {
    const csv = taxReportToCsv(SAMPLE);
    expect(csv).toContain("2026-04,100.00,16.00,20.00,120.00");
    expect(csv).toContain("2026-05,50.00,8.00,30.00,80.00");
    expect(csv).toContain("Total,150.00,24.00,50.00,200.00");
  });

  it("works without a per-month breakdown (just header + Total)", () => {
    const csv = taxReportToCsv({ ...SAMPLE, byMonth: undefined });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Total,150.00,24.00,50.00,200.00");
  });
});

describe("taxReportToPrintableHtml (AC2 — PDF via browser print)", () => {
  it("returns a self-contained HTML document with the period + the three figures", () => {
    const html = taxReportToPrintableHtml(SAMPLE);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("2026-04-01");
    expect(html).toContain("2026-05-31");
    expect(html).toContain("<table");
    // The three AC1 figures + total are present.
    expect(html).toContain("Taxable supplies");
    expect(html).toContain("VAT charged");
    expect(html).toContain("Exempt supplies");
    expect(html).toContain("150.00");
    expect(html).toContain("24.00");
    expect(html).toContain("50.00");
  });

  it("renders one row per month in the breakdown", () => {
    const html = taxReportToPrintableHtml(SAMPLE);
    expect(html).toContain("2026-04");
    expect(html).toContain("2026-05");
  });

  it("escapes HTML-special characters (no injection)", () => {
    const html = taxReportToPrintableHtml(SAMPLE);
    expect(html).not.toMatch(/<script>/);
  });
});

describe("export filenames + url", () => {
  it("derive a csv + html filename from the period", () => {
    expect(taxReportCsvFilename(SAMPLE)).toBe("tax_2026-04-01_2026-05-31.csv");
    expect(taxReportPdfFilename(SAMPLE)).toBe("tax_2026-04-01_2026-05-31.html");
  });

  it("builds the export URL carrying the date range", () => {
    const url = taxReportExportUrl({ format: "csv", fromDate: "2026-04-01", toDate: "2026-05-31" });
    expect(url).toContain("/admin/tax-report/export.csv");
    expect(url).toContain("fromDate=2026-04-01");
    expect(url).toContain("toDate=2026-05-31");
  });
});
