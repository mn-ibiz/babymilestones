"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StaffEarningsPage from "./page";

/**
 * P3-E02-S02 (admin) — earnings breakdown render-contract tests in the admin
 * convention (no jsdom): drive the page through a stubbed `fetch` and assert the
 * server-rendered markup. The first paint (before the dropdown fetch resolves)
 * shows the heading but no earnings/breakdown; the breakdown markup itself is
 * exercised via the lib view-model unit tests (`staff-earnings.test.ts`).
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Staff earnings page (P3-E02-S02)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof StaffEarningsPage).toBe("function");
  });

  it("renders the staff-earnings heading on first paint", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<StaffEarningsPage />);
    expect(html).toContain("Staff earnings");
  });

  it("does not render any earnings/breakdown before a staff member is chosen", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>);
    const html = renderToStaticMarkup(<StaffEarningsPage />);
    expect(html).not.toContain("Completed visits");
    expect(html).not.toContain("breakdown");
    expect(html).not.toContain("Top services");
  });
});
