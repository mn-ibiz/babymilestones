"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PnlReportPage from "./page";

/**
 * P6-E05-S01 (Story 35.1) — consolidated-P&L page render-contract. First paint
 * shows the heading, the anchor + granularity picker (AC1/AC2), and the CSV
 * ("Excel") + PDF export links (AC3) before the fetch resolves.
 */
describe("Consolidated P&L page (P6-E05-S01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof PnlReportPage).toBe("function");
  });

  it("renders the heading + picker + export links on first paint (AC1/AC2/AC3)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<PnlReportPage />);
    expect(html).toContain("Consolidated P&amp;L");
    // Anchor + granularity picker (AC1/AC2).
    expect(html).toContain('type="date"');
    expect(html).toContain("Month vs last month");
    expect(html).toContain("Year vs last year");
    // CSV ("Excel") + PDF export links with the same filter (AC3).
    expect(html).toContain("/admin/pnl-report/export.csv");
    expect(html).toContain("/admin/pnl-report/export.pdf");
    expect(html).toContain("Export Excel (CSV)");
    expect(html).toContain("Export PDF");
  });
});
