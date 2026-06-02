"use client";

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ServicesPage from "./page";

/**
 * P1-E07-S01 / P5-E01-S01 (Story 31.1) — services admin page render-contract
 * tests in the admin convention (no jsdom): drive the page through a stubbed
 * `fetch` and assert the server-rendered first-paint markup. The detailed
 * coaching-form shaping (format options, duration validation, age-stage tag
 * parsing) is exercised via the `lib/services-form` view-model unit tests; here
 * we assert the page wires those primitives into the create form.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Services admin page (P1-E07-S01 / Story 31.1)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof ServicesPage).toBe("function");
  });

  it("offers Coaching as a selectable unit on first paint (AC1)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<ServicesPage />);
    expect(html).toContain("Services");
    expect(html).toContain("Add a service");
    // The unit selector exposes the coaching unit (AC1).
    expect(html).toContain('value="coaching"');
    expect(html).toContain(">Coaching<");
    // The attribution-role select lets admin require a coach (AC3 — no-login staff).
    expect(html).toContain('value="coach"');
  });
});
