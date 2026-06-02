"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SalonReportPage from "./page";

/**
 * P3-E03-S05 (Story 25.5) — salon-report page render-contract tests in the admin
 * convention (no jsdom): drive the page through a stubbed `fetch` and assert the
 * server-rendered markup. The first paint (before the report fetch resolves)
 * shows the heading + the three tile labels but no per-stylist data yet; the
 * tile / drill-down shaping itself is exercised via the lib view-model unit tests
 * (`salon-report.test.ts`).
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Salon report page (P3-E03-S05)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof SalonReportPage).toBe("function");
  });

  it("renders the salon-report heading + tile labels on first paint (AC1)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<SalonReportPage />);
    expect(html).toContain("Salon today");
    expect(html).toContain("Bookings");
    expect(html).toContain("No-shows");
    expect(html).toContain("Revenue");
  });

  it("renders the per-stylist drill-down heading (AC2)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>);
    const html = renderToStaticMarkup(<SalonReportPage />);
    expect(html).toContain("By stylist");
  });
});
