"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OperationsDashboardPage from "./page";

/**
 * P3-E05-S01 (Story 27.1) — operations-dashboard page render-contract tests in
 * the admin convention (no jsdom): drive the page through a stubbed `fetch` and
 * assert the server-rendered markup. First paint (before the fetch resolves)
 * shows the heading + the five tile labels as drill-down links (AC1/AC2); the
 * tile / drill-down shaping itself is exercised via the lib view-model unit tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Operations dashboard page (P3-E05-S01)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof OperationsDashboardPage).toBe("function");
  });

  it("renders the dashboard heading + the five tile labels on first paint (AC1)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<OperationsDashboardPage />);
    expect(html).toContain("Today");
    expect(html).toContain("Today&#x27;s revenue");
    expect(html).toContain("Bookings today");
    expect(html).toContain("Active sessions");
    expect(html).toContain("Outstanding balances");
    expect(html).toContain("Top staff today");
  });

  it("renders each tile as a drill-down link (AC2)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>);
    const html = renderToStaticMarkup(<OperationsDashboardPage />);
    expect(html).toContain('href="/operations/revenue"');
    expect(html).toContain('href="/operations/bookings"');
    expect(html).toContain('href="/reception/attendance"');
    expect(html).toContain('href="/treasury/reconciliation"');
    expect(html).toContain('href="/staff-earnings"');
  });
});
