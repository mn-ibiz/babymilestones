import { describe, expect, it } from "vitest";
import type { PosProduct } from "@bm/contracts";
import {
  POS_SEARCH_MIN_QUERY,
  formatKes,
  isOutOfStock,
  shouldSearch,
  stockLabel,
} from "./products.js";

const product = (over: Partial<PosProduct> = {}): PosProduct => ({
  id: "p1",
  sku: "SKU-1",
  barcode: null,
  name: "Thing",
  priceCents: 12345,
  stockQty: 4,
  inStock: true,
  taxTreatment: "vat_exempt",
  ...over,
});

describe("POS product helpers (P2-E04-S02)", () => {
  describe("formatKes", () => {
    it("formats cents as KES with 2 decimals + thousands separators", () => {
      expect(formatKes(12345)).toBe("KES 123.45");
      expect(formatKes(85000)).toBe("KES 850.00");
      expect(formatKes(100000000)).toBe("KES 1,000,000.00");
      expect(formatKes(0)).toBe("KES 0.00");
    });
  });

  describe("isOutOfStock (AC3)", () => {
    it("is true when the product is not in stock", () => {
      expect(isOutOfStock(product({ inStock: false, stockQty: 0 }))).toBe(true);
    });
    it("is false when in stock", () => {
      expect(isOutOfStock(product({ inStock: true, stockQty: 4 }))).toBe(false);
    });
  });

  describe("stockLabel", () => {
    it("shows the count when in stock", () => {
      expect(stockLabel(product({ stockQty: 7, inStock: true }))).toMatch(/7/u);
    });
    it("shows out of stock when empty", () => {
      expect(stockLabel(product({ stockQty: 0, inStock: false }))).toMatch(/out of stock/iu);
    });
  });

  describe("shouldSearch (AC2 — debounced min length)", () => {
    it("requires at least the minimum query length", () => {
      expect(POS_SEARCH_MIN_QUERY).toBe(2);
      expect(shouldSearch("a")).toBe(false);
      expect(shouldSearch(" a ")).toBe(false);
      expect(shouldSearch("ab")).toBe(true);
      expect(shouldSearch("  nappies ")).toBe(true);
    });
    it("is false for an empty query", () => {
      expect(shouldSearch("")).toBe(false);
    });
  });
});
