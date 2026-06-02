"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ArticlesPage from "./page";

/**
 * P6-E06-S04 (Story 36.4) — Blog / Articles admin screen render-contract tests in
 * the admin convention (no jsdom): drive the page through a stubbed `fetch` and
 * assert the server-rendered first paint. View-model shaping is exercised in the
 * lib tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Articles page (P6-E06-S04)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof ArticlesPage).toBe("function");
  });

  it("renders the heading + the create/edit form fields on first paint (AC2)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<ArticlesPage />);
    expect(html).toContain("Blog");
    // AC2: the editable article fields.
    expect(html).toContain("Title");
    expect(html).toContain("Slug");
    expect(html).toContain("Body");
    expect(html).toContain("Cover image");
    expect(html).toContain("Tags");
    expect(html).toContain("Author");
    // Lifecycle controls.
    expect(html).toContain("Publish");
  });
});
