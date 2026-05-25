import { describe, expect, it } from "vitest";
import {
  validateExportRange,
  canExport,
  exportUrl,
  exportFilename,
  rangeSummary,
} from "./reconciliation-export";

describe("reconciliation export form (P1-E06-S04)", () => {
  it("requires both dates", () => {
    expect(validateExportRange({ fromDate: "", toDate: "2026-05-31" })).toMatch(/start and end/u);
    expect(validateExportRange({ fromDate: "2026-05-01", toDate: "" })).toMatch(/start and end/u);
  });

  it("accepts a valid inclusive range and rejects from>to (AC1)", () => {
    expect(validateExportRange({ fromDate: "2026-05-01", toDate: "2026-05-31" })).toBeNull();
    expect(canExport({ fromDate: "2026-05-01", toDate: "2026-05-31" })).toBe(true);
    expect(canExport({ fromDate: "2026-05-31", toDate: "2026-05-01" })).toBe(false);
  });

  it("rejects ranges over the cap", () => {
    expect(canExport({ fromDate: "2024-01-01", toDate: "2026-01-01" })).toBe(false);
  });

  it("builds the export URL with the range params", () => {
    expect(exportUrl({ fromDate: "2026-05-01", toDate: "2026-05-31" })).toBe(
      "/treasury/reconciliation/export?fromDate=2026-05-01&toDate=2026-05-31",
    );
  });

  it("derives the download filename", () => {
    expect(exportFilename({ fromDate: "2026-05-01", toDate: "2026-05-31" })).toBe(
      "reconciliation_2026-05-01_to_2026-05-31.csv",
    );
  });

  it("summarises the range size, empty when invalid", () => {
    expect(rangeSummary({ fromDate: "2026-05-01", toDate: "2026-05-03" })).toMatch(/3 days/u);
    expect(rangeSummary({ fromDate: "2026-05-01", toDate: "2026-05-01" })).toMatch(/1 day /u);
    expect(rangeSummary({ fromDate: "2026-05-31", toDate: "2026-05-01" })).toBe("");
  });
});
