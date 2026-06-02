import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PosTabs } from "./PosTabs";

/**
 * Story 29.1 (P4-E04-S01 AC1) — the POS tab nav puts the new "Online orders" tab
 * alongside the in-store "Sale" tab. Render-contract test in the POS convention.
 */
describe("PosTabs (Story 29.1 AC1)", () => {
  it("renders the Sale tab linking to root", () => {
    const html = renderToStaticMarkup(<PosTabs />);
    expect(html).toContain("Sale");
    expect(html).toContain('href="/"');
  });

  it("renders the Online orders tab alongside it (AC1)", () => {
    const html = renderToStaticMarkup(<PosTabs />);
    expect(html).toContain("Online orders");
    expect(html).toContain('href="/online-orders"');
  });
});
