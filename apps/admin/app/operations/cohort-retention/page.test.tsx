"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CohortRetentionPage from "./page";

/**
 * Story 35.2 — cohort-retention page render-contract. First paint shows the heading
 * and the signup-month range picker before the fetch resolves; the triangular matrix
 * (rows = signup month, columns = months-since-signup) renders once loaded (AC1).
 */
describe("Operations cohort-retention page (Story 35.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof CohortRetentionPage).toBe("function");
  });

  it("renders the heading + month-range picker on first paint (AC1)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<CohortRetentionPage />);
    expect(html).toContain("Cohort retention");
    // Two month pickers (from / to) drive the signup-month range filter.
    expect(html).toContain('type="month"');
    expect(html).toContain("Signup-month range");
  });
});
