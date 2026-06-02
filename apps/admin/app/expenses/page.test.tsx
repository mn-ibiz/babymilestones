"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ExpensesPage from "./page";

/**
 * P6-E05-S05 (Story 35.5) — Expenses page render-contract tests in the admin
 * convention (no jsdom): drive the page through a stubbed `fetch` and assert the
 * server-rendered first paint. View-model shaping is exercised in the lib tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Expenses page (P6-E05-S05)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof ExpensesPage).toBe("function");
  });

  it("renders the heading + record/list/recurring sections on first paint (AC1/AC2/AC3)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<ExpensesPage />);
    expect(html).toContain("Expenses");
    // AC1/AC2: a record-an-expense form.
    expect(html).toContain("Record an expense");
    // AC1: a period list.
    expect(html).toContain("Expenses this period");
    // AC3: recurring templates.
    expect(html).toContain("Recurring expenses");
    // The unit picker offers shared overhead (null unit).
    expect(html).toContain("Shared overhead (no unit)");
  });
});
