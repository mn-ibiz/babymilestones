"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewSnippetsPage from "./page";

/**
 * P6-E04-S04 (Story 34.4) — review-snippets curation page render-contract tests in
 * the admin convention (no jsdom): drive the page through a stubbed `fetch` and
 * assert the server-rendered first paint. The view-model shaping itself is exercised
 * via the lib unit tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Review snippets page (P6-E04-S04)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof ReviewSnippetsPage).toBe("function");
  });

  it("renders the heading + candidate and curated sections on first paint (AC1/AC2)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<ReviewSnippetsPage />);
    expect(html).toContain("Review snippets");
    // AC1: a candidate-curation section.
    expect(html).toContain("5-star comments to curate");
    // AC2/AC3: a curated-snippets section.
    expect(html).toContain("Curated snippets");
    // The page states the anonymisation guarantee.
    expect(html).toContain("anonymised");
  });
});
