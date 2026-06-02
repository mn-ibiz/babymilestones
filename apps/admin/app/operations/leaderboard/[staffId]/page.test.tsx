"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// next/navigation is not available under the test runner; stub the hooks the
// drill-down page reads so it renders its first-paint contract.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("fromDate=2026-06-01&toDate=2026-06-07"),
}));

import StaffCommissionPage from "./page";

/**
 * P3-E05-S03 (Story 27.3) — per-staff commission drill-down page render-contract
 * (AC3). First paint shows the heading + a back link to the leaderboard before
 * the fetch resolves; the netted commission totals reuse the commission ledger
 * (shaped by the lib/contract view-models, covered by their own tests).
 */
describe("Per-staff commission drill-down page (P3-E05-S03 AC3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof StaffCommissionPage).toBe("function");
  });

  it("renders the heading + back-to-leaderboard link on first paint (AC3)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<StaffCommissionPage params={{ staffId: "s1" }} />);
    expect(html).toContain("Commission");
    expect(html).toContain("/operations/leaderboard");
  });
});
