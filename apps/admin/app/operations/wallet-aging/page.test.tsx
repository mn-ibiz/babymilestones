"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WalletAgingPage from "./page";

/**
 * P3-E05-S04 (Story 27.4) — wallet-aging-report page render-contract. First paint
 * shows the heading, the as-of date picker, and the CSV export link (AC3) before
 * the fetch resolves; the five aging buckets (AC1) render once loaded.
 */
describe("Operations wallet-aging page (P3-E05-S04)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof WalletAgingPage).toBe("function");
  });

  it("renders the heading + as-of picker + export link on first paint (AC1/AC3)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<WalletAgingPage />);
    expect(html).toContain("Wallet aging");
    expect(html).toContain('type="date"');
    // CSV export link (AC3).
    expect(html).toContain("/admin/wallet-aging/export");
    expect(html).toContain("Export CSV");
  });
});
