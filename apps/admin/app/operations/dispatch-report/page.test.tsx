"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DispatchReportPage from "./page";

/**
 * P4-E04-S04 (Story 29.4) — daily dispatch report page render-contract. First
 * paint shows the heading, the date filter (AC4), and the CSV export link (AC3)
 * before the fetch resolves.
 */
describe("Operations dispatch report page (P4-E04-S04)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof DispatchReportPage).toBe("function");
  });

  it("renders the heading + date filter + export link on first paint (AC3/AC4)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<DispatchReportPage />);
    expect(html).toContain("Daily dispatch report");
    // Date filter (AC4).
    expect(html).toContain('type="date"');
    // CSV export link (AC3).
    expect(html).toContain("/admin/daily-dispatch/export");
    expect(html).toContain("Export CSV");
  });
});
