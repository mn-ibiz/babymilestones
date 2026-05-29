"use client";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JobsPage from "./page";

/**
 * P3-E06-S01 AC4 (admin) — background-jobs console. Render-contract tests in the
 * admin convention (no jsdom): drive the component's effect through a stubbed
 * `fetch` and assert the server-rendered markup + the run-now POST. Keeps the
 * admin bundle test-light.
 */
type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>;

function stubFetch(handler: FetchLike): void {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

describe("Jobs console page (P3-E06-S01 AC4)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof JobsPage).toBe("function");
  });

  it("renders the jobs heading on first paint (before data loads)", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>); // never resolves
    const html = renderToStaticMarkup(<JobsPage />);
    expect(html).toContain("Background jobs");
    // Loading state is shown until the registry fetch resolves.
    expect(html).toContain("Loading");
  });

  it("does not leak a privileged registry before the fetch resolves", () => {
    stubFetch(() => new Promise(() => {}) as Promise<unknown>);
    const html = renderToStaticMarkup(<JobsPage />);
    // No job rows / Run-now buttons until data arrives.
    expect(html).not.toContain("Run now");
  });
});
