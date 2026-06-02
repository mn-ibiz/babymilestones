import { describe, expect, it } from "vitest";
import {
  canManageSkuMappings,
  parseWooProductIdEntry,
  importSummaryLabel,
  reconciliationSummaryLabel,
} from "./sku-mapping.js";

/**
 * Story 29.5 (P4-E04-S05) — admin SKU-mapping + reconciliation view logic.
 */
describe("sku-mapping admin view logic (Story 29.5)", () => {
  it("gates management to admin / super_admin (AC5)", () => {
    expect(canManageSkuMappings("admin")).toBe(true);
    expect(canManageSkuMappings("super_admin")).toBe(true);
    expect(canManageSkuMappings("reception")).toBe(false);
    expect(canManageSkuMappings("cashier")).toBe(false);
  });

  it("parses a manual woo_product_id entry (AC5)", () => {
    expect(parseWooProductIdEntry("")).toEqual({ ok: true, value: null }); // clear
    expect(parseWooProductIdEntry("  ")).toEqual({ ok: true, value: null });
    expect(parseWooProductIdEntry("4242")).toEqual({ ok: true, value: 4242 });
    expect(parseWooProductIdEntry("abc").ok).toBe(false);
    expect(parseWooProductIdEntry("-3").ok).toBe(false);
    expect(parseWooProductIdEntry("1.5").ok).toBe(false);
  });

  it("summarises a bulk import outcome (AC5)", () => {
    expect(importSummaryLabel({ applied: 3, errors: [] })).toMatch(/Imported 3 mapping/u);
    expect(importSummaryLabel({ applied: 2, errors: [{ line: 4 }] })).toMatch(/1 row\(s\) skipped/u);
  });

  it("summarises a reconciliation report (AC6)", () => {
    expect(reconciliationSummaryLabel(null)).toMatch(/No reconciliation/u);
    expect(
      reconciliationSummaryLabel({ generatedAt: "2026-06-02T02:00:00Z", comparedCount: 5, drift: [] }),
    ).toMatch(/All 5 mapped SKUs are in sync/u);
    expect(
      reconciliationSummaryLabel({
        generatedAt: "2026-06-02T02:00:00Z",
        comparedCount: 5,
        drift: [
          { productId: "p1", sku: "A", name: "A", wooProductId: 1, localStock: 3, wooStock: 8, delta: -5 },
        ],
      }),
    ).toMatch(/1 of 5 mapped SKUs have drifted/u);
  });
});
