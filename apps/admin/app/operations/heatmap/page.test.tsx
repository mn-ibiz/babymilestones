"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PeakHoursHeatmapPage from "./page";

/**
 * P3-E05-S05 (Story 27.5) — peak-hours-heatmap page render-contract. First paint
 * shows the heading, the date-range picker (AC3), the unit filter control (AC2),
 * and a 7×24 grid scaffold (AC1) before the fetch resolves.
 */
describe("Operations peak-hours heatmap page (P3-E05-S05)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof PeakHoursHeatmapPage).toBe("function");
  });

  it("renders the heading + range picker + unit filter on first paint (AC1/AC2/AC3)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<PeakHoursHeatmapPage />);
    expect(html).toContain("Peak hours");
    // Date-range picker (AC3).
    expect(html).toContain('type="date"');
    expect(html).toContain("From");
    expect(html).toContain("To");
    // Unit filter control (AC2).
    expect(html).toContain("Unit");
    expect(html).toContain("All units");
    expect(html).toContain("Salon");
    // 7×24 grid scaffold (AC1): every weekday label is present.
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(html).toContain(day);
    }
  });
});
