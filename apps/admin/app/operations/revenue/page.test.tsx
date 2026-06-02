"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RevenueDrillDownPage from "./page";

/**
 * P3-E05-S01 (Story 27.1) — revenue drill-down render-contract. The dashboard
 * revenue tile + each non-salon unit clicks through here (AC2). First paint shows
 * the heading + the per-unit breakdown scaffold before the fetch resolves.
 */
describe("Operations revenue drill-down (P3-E05-S01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof RevenueDrillDownPage).toBe("function");
  });

  it("renders the revenue drill-down heading on first paint (AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<RevenueDrillDownPage />);
    expect(html).toContain("Today");
    expect(html).toContain("revenue");
  });
});
