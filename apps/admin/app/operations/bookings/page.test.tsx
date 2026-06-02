"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingsDrillDownPage from "./page";

/**
 * P3-E05-S01 (Story 27.1) — bookings drill-down render-contract. The dashboard
 * bookings tile clicks through here (AC2). First paint shows the heading before
 * the fetch resolves.
 */
describe("Operations bookings drill-down (P3-E05-S01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof BookingsDrillDownPage).toBe("function");
  });

  it("renders the bookings drill-down heading on first paint (AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<BookingsDrillDownPage />);
    expect(html).toContain("Bookings today");
  });
});
