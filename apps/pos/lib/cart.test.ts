import { describe, expect, it } from "vitest";
import type { PosProduct } from "@bm/contracts";
import {
  addProduct,
  computeTotals,
  decrementQty,
  emptyCart,
  incrementQty,
  removeLine,
  setLineDiscountPct,
  setOverallDiscount,
  setQty,
  validateStock,
} from "./cart.js";

const product = (over: Partial<PosProduct> = {}): PosProduct => ({
  id: "p1",
  sku: "SKU-1",
  barcode: null,
  name: "Thing",
  priceCents: 1000,
  stockQty: 10,
  inStock: true,
  taxTreatment: "vat_exempt",
  ...over,
});

describe("POS cart (P2-E04-S03)", () => {
  describe("line operations (AC1)", () => {
    it("adds a product as a qty-1 line", () => {
      const cart = addProduct(emptyCart, product());
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0]).toMatchObject({ qty: 1, lineDiscountPct: 0 });
    });

    it("merges a repeated product into one line, bumping qty", () => {
      let cart = addProduct(emptyCart, product());
      cart = addProduct(cart, product());
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0]!.qty).toBe(2);
    });

    it("refreshes the product snapshot (price/stock) when re-added", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000, stockQty: 5 }));
      cart = addProduct(cart, product({ priceCents: 1200, stockQty: 8 }));
      expect(cart.lines[0]!.qty).toBe(2);
      expect(cart.lines[0]!.product.priceCents).toBe(1200);
      expect(cart.lines[0]!.product.stockQty).toBe(8);
    });

    it("increments and decrements qty, clamping at 1", () => {
      let cart = addProduct(emptyCart, product());
      cart = incrementQty(cart, "p1");
      expect(cart.lines[0]!.qty).toBe(2);
      cart = decrementQty(cart, "p1");
      cart = decrementQty(cart, "p1");
      expect(cart.lines[0]!.qty).toBe(1); // never below 1
    });

    it("setQty clamps to a minimum of 1 and floors fractional input", () => {
      let cart = addProduct(emptyCart, product());
      cart = setQty(cart, "p1", 0);
      expect(cart.lines[0]!.qty).toBe(1);
      cart = setQty(cart, "p1", 3.9);
      expect(cart.lines[0]!.qty).toBe(3);
    });

    it("removes a line", () => {
      let cart = addProduct(emptyCart, product());
      cart = removeLine(cart, "p1");
      expect(cart.lines).toHaveLength(0);
    });

    it("clamps a line discount to 0..100", () => {
      let cart = addProduct(emptyCart, product());
      cart = setLineDiscountPct(cart, "p1", 150);
      expect(cart.lines[0]!.lineDiscountPct).toBe(100);
      cart = setLineDiscountPct(cart, "p1", -5);
      expect(cart.lines[0]!.lineDiscountPct).toBe(0);
    });
  });

  describe("computeTotals (AC1/AC2/AC3 — live totals + per-line tax)", () => {
    it("sums a simple exempt cart with no discounts", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000 }));
      cart = setQty(cart, "p1", 2);
      const t = computeTotals(cart);
      expect(t.subtotalCents).toBe(2000);
      expect(t.discountTotalCents).toBe(0);
      expect(t.taxTotalCents).toBe(0);
      expect(t.grandTotalCents).toBe(2000);
    });

    it("applies a per-line discount %", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000 }));
      cart = setQty(cart, "p1", 2);
      cart = setLineDiscountPct(cart, "p1", 10);
      const t = computeTotals(cart);
      expect(t.discountTotalCents).toBe(200);
      expect(t.grandTotalCents).toBe(1800);
    });

    it("applies an overall % discount on top of line discounts", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000 }));
      cart = setQty(cart, "p1", 2); // 2000
      cart = setOverallDiscount(cart, { kind: "pct", value: 50 });
      const t = computeTotals(cart);
      expect(t.grandTotalCents).toBe(1000);
      expect(t.discountTotalCents).toBe(1000);
    });

    it("distributes an overall KES discount proportionally across lines", () => {
      let cart = addProduct(emptyCart, product({ id: "a", sku: "A", priceCents: 1000 }));
      cart = setQty(cart, "a", 2); // 2000
      cart = addProduct(cart, product({ id: "b", sku: "B", priceCents: 1000 }));
      // a: 2000, b: 1000, total 3000; overall KES 300 → a -200, b -100
      cart = setOverallDiscount(cart, { kind: "kes", valueCents: 300 });
      const t = computeTotals(cart);
      expect(t.discountTotalCents).toBe(300);
      expect(t.grandTotalCents).toBe(2700);
      const byId = Object.fromEntries(t.lines.map((l) => [l.productId, l.grossCents]));
      expect(byId.a).toBe(1800);
      expect(byId.b).toBe(900);
    });

    it("caps an overall KES discount at the cart total (never negative)", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000 }));
      cart = setOverallDiscount(cart, { kind: "kes", valueCents: 5000 });
      const t = computeTotals(cart);
      expect(t.grandTotalCents).toBe(0);
      expect(t.discountTotalCents).toBe(1000);
    });

    it("adds VAT on top for a vat_exclusive line (AC3)", () => {
      const cart = addProduct(emptyCart, product({ taxTreatment: "vat_exclusive", priceCents: 1000 }));
      const t = computeTotals(cart);
      expect(t.taxTotalCents).toBe(160); // 16%
      expect(t.grandTotalCents).toBe(1160);
      expect(t.subtotalCents).toBe(1000); // ex-VAT
      expect(t.lines[0]!.taxCents).toBe(160); // tax exposed per line (AC3)
    });

    it("backs VAT out of a vat_inclusive line (AC3)", () => {
      const cart = addProduct(emptyCart, product({ taxTreatment: "vat_inclusive", priceCents: 1160 }));
      const t = computeTotals(cart);
      expect(t.taxTotalCents).toBe(160);
      expect(t.grandTotalCents).toBe(1160);
      expect(t.lines[0]!.netCents).toBe(1000);
      expect(t.subtotalCents).toBe(1000); // ex-VAT (net of the inclusive price)
    });

    it("summary reconciles (subtotal − discount + VAT = total) for every treatment", () => {
      for (const treatment of ["vat_exempt", "vat_exclusive", "vat_inclusive", "zero_rated"] as const) {
        let cart = addProduct(emptyCart, product({ taxTreatment: treatment, priceCents: 1160 }));
        cart = setQty(cart, "p1", 3);
        cart = setLineDiscountPct(cart, "p1", 10);
        cart = setOverallDiscount(cart, { kind: "pct", value: 5 });
        const t = computeTotals(cart);
        expect(t.subtotalCents - t.discountTotalCents + t.taxTotalCents).toBe(t.grandTotalCents);
      }
    });

    it("never produces NaN from a non-finite discount input", () => {
      let cart = addProduct(emptyCart, product({ priceCents: 1000 }));
      cart = setLineDiscountPct(cart, "p1", Number("abc")); // NaN
      expect(cart.lines[0]!.lineDiscountPct).toBe(0);
      cart = setOverallDiscount(cart, { kind: "kes", valueCents: Number("xyz") }); // NaN
      const t = computeTotals(cart);
      expect(Number.isFinite(t.grandTotalCents)).toBe(true);
      expect(t.grandTotalCents).toBe(1000);
    });

    it("distributes an overall KES discount exactly across uneven lines, never below zero", () => {
      let cart = addProduct(emptyCart, product({ id: "a", sku: "A", priceCents: 1 }));
      cart = addProduct(cart, product({ id: "b", sku: "B", priceCents: 1 }));
      cart = addProduct(cart, product({ id: "c", sku: "C", priceCents: 1000 }));
      cart = setOverallDiscount(cart, { kind: "kes", valueCents: 3 });
      const t = computeTotals(cart);
      expect(t.discountTotalCents).toBe(3);
      t.lines.forEach((l) => expect(l.discountedLineCents).toBeGreaterThanOrEqual(0));
    });
  });

  describe("validateStock (AC4 — block at Pay)", () => {
    it("passes when every line is within stock", () => {
      let cart = addProduct(emptyCart, product({ stockQty: 5 }));
      cart = setQty(cart, "p1", 5);
      expect(validateStock(cart)).toEqual({ ok: true, violations: [] });
    });

    it("flags a line whose qty exceeds available stock", () => {
      let cart = addProduct(emptyCart, product({ name: "Rattle", stockQty: 3 }));
      cart = setQty(cart, "p1", 5);
      const check = validateStock(cart);
      expect(check.ok).toBe(false);
      expect(check.violations).toEqual([
        { productId: "p1", name: "Rattle", requested: 5, available: 3 },
      ]);
    });
  });
});
