"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FeedbackDashboardPage from "./page";

/**
 * P6-E04-S02 (Story 34.2) — feedback-dashboard page render-contract tests in the
 * admin convention (no jsdom): drive the page through a stubbed `fetch` and assert
 * the server-rendered markup. First paint (before the fetch resolves) shows the
 * heading, the date-range filter, and the unit + staff table headings (AC1/AC2);
 * the view-model shaping itself is exercised via the lib unit tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Feedback dashboard page (P6-E04-S02)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof FeedbackDashboardPage).toBe("function");
  });

  it("renders the heading + date-range filter + unit/staff sections on first paint (AC1/AC2)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<FeedbackDashboardPage />);
    expect(html).toContain("Feedback");
    // AC2: a from/to date-range filter.
    expect(html).toContain('type="date"');
    // AC1: by-unit + by-staff tables.
    expect(html).toContain("By unit");
    expect(html).toContain("By staff");
  });
});
