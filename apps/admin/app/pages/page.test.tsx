"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PagesPage from "./page";

/**
 * P6-E06-S03 (Story 36.3) — CMS Pages screen render-contract tests in the admin
 * convention (no jsdom): drive the page through a stubbed `fetch` and assert the
 * server-rendered first paint. View-model shaping is exercised in the lib tests.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("CMS Pages page (P6-E06-S03)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof PagesPage).toBe("function");
  });

  it("renders the heading, the page picker + editor sections on first paint (AC1/AC2/AC3)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<PagesPage />);
    expect(html).toContain("Pages");
    // AC1: the editable hero/CTA/body-section fields.
    expect(html).toContain("Hero copy");
    expect(html).toContain("CTA label");
    expect(html).toContain("Body sections");
    // AC2: preview + publish controls.
    expect(html).toContain("Preview");
    expect(html).toContain("Publish");
    // AC3: a revisions area.
    expect(html).toContain("Revisions");
    // The slug picker offers the known unit pages.
    expect(html).toContain("Play");
  });
});
