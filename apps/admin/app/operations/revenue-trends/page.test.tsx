"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RevenueTrendsPage from "./page";

/**
 * P3-E05-S02 (Story 27.2) — revenue-by-unit-by-period page render-contract. First
 * paint shows the heading, the date-range picker (AC1), and the CSV export link
 * (AC2) before the fetch resolves.
 */
describe("Operations revenue trends page (P3-E05-S02)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof RevenueTrendsPage).toBe("function");
  });

  it("renders the heading + date-range picker + export link on first paint (AC1/AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<RevenueTrendsPage />);
    expect(html).toContain("Revenue by unit");
    // Date-range picker (AC1).
    expect(html).toContain('type="date"');
    expect(html).toContain("From");
    expect(html).toContain("To");
    // CSV export link with the same filter (AC2).
    expect(html).toContain("/admin/revenue-by-period/export");
    expect(html).toContain("Export CSV");
  });
});
