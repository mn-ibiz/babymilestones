"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TaxReportPage from "./page";

/**
 * P6-E07-S06 (Story 35.6) — tax-ready export page render-contract. First paint
 * shows the heading, the date-range picker (AC1), and the CSV ("Excel") + PDF
 * export links (AC2) before the fetch resolves.
 */
describe("Tax-ready export page (P6-E07-S06)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof TaxReportPage).toBe("function");
  });

  it("renders the heading + range picker + export links on first paint (AC1/AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<TaxReportPage />);
    expect(html).toContain("Tax-ready");
    // Date-range picker (AC1).
    expect(html).toContain('type="date"');
    // The three AC1 column headings.
    expect(html).toContain("Taxable supplies");
    expect(html).toContain("VAT charged");
    expect(html).toContain("Exempt supplies");
    // CSV ("Excel") + PDF export links with the same filter (AC2).
    expect(html).toContain("/admin/tax-report/export.csv");
    expect(html).toContain("/admin/tax-report/export.pdf");
    expect(html).toContain("Export Excel (CSV)");
    expect(html).toContain("Export PDF");
  });
});
