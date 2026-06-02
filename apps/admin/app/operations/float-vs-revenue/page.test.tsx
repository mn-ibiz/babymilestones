"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FloatVsRevenuePage from "./page";

/**
 * P5-E05-S04 (Story 35.4) — float-vs-revenue page render-contract. First paint
 * shows the heading and the snapshot KPI labels (AC1) + the chart section (AC2)
 * before the fetch resolves.
 */
describe("Operations float-vs-revenue page (P5-E05-S04)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof FloatVsRevenuePage).toBe("function");
  });

  it("renders the heading + the snapshot KPI labels + the chart section on first paint (AC1/AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<FloatVsRevenuePage />);
    expect(html).toContain("Wallet float vs revenue");
    // AC1 — the four daily-snapshot KPIs.
    expect(html).toContain("Customer wallet liability");
    expect(html).toContain("Segregated balance");
    expect(html).toContain("Prior-day change");
    expect(html).toContain("Revenue earned");
    // AC2 — the 90-day series section.
    expect(html).toContain("90-day");
  });
});
