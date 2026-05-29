import { describe, expect, it } from "vitest";
import { computeLineTax, computeSaleTotals, type SaleLineInput } from "./pricing.js";

const line = (over: Partial<SaleLineInput> = {}): SaleLineInput => ({
  priceCents: 1000,
  qty: 1,
  lineDiscountPct: 0,
  taxTreatment: "vat_exempt",
  ...over,
});

describe("POS pricing (P2-E04)", () => {
  describe("computeLineTax", () => {
    it("exempt/zero-rated has no tax", () => {
      expect(computeLineTax("vat_exempt", 1000)).toEqual({ netCents: 1000, taxCents: 0, grossCents: 1000 });
      expect(computeLineTax("zero_rated", 1000).taxCents).toBe(0);
    });
    it("vat_exclusive adds 16% on top", () => {
      expect(computeLineTax("vat_exclusive", 1000)).toEqual({ netCents: 1000, taxCents: 160, grossCents: 1160 });
    });
    it("vat_inclusive backs the tax out", () => {
      expect(computeLineTax("vat_inclusive", 1160)).toEqual({ netCents: 1000, taxCents: 160, grossCents: 1160 });
    });
  });

  describe("computeSaleTotals", () => {
    it("sums a simple exempt cart", () => {
      const t = computeSaleTotals([line({ priceCents: 1000, qty: 2 })]);
      expect(t).toMatchObject({ subtotalCents: 2000, discountTotalCents: 0, taxTotalCents: 0, grandTotalCents: 2000 });
    });

    it("applies line + overall discount", () => {
      const t = computeSaleTotals([line({ priceCents: 1000, qty: 2, lineDiscountPct: 10 })], { kind: "pct", value: 50 });
      // 2000 → line 10% → 1800 → overall 50% → 900
      expect(t.grandTotalCents).toBe(900);
      expect(t.discountTotalCents).toBe(1100);
    });

    it("reconciles subtotal − discount + VAT = total for every treatment", () => {
      for (const taxTreatment of ["vat_exempt", "vat_exclusive", "vat_inclusive", "zero_rated"] as const) {
        const t = computeSaleTotals([line({ priceCents: 1160, qty: 3, taxTreatment, lineDiscountPct: 10 })], {
          kind: "pct",
          value: 5,
        });
        expect(t.subtotalCents - t.discountTotalCents + t.taxTotalCents).toBe(t.grandTotalCents);
      }
    });

    it("distributes an overall KES discount exactly, never below zero", () => {
      const t = computeSaleTotals(
        [line({ priceCents: 1 }), line({ priceCents: 1 }), line({ priceCents: 1000 })],
        { kind: "kes", valueCents: 3 },
      );
      expect(t.discountTotalCents).toBe(3);
      t.lines.forEach((l) => expect(l.discountedLineCents).toBeGreaterThanOrEqual(0));
    });

    it("caps an overall KES discount at the cart total", () => {
      const t = computeSaleTotals([line({ priceCents: 1000 })], { kind: "kes", valueCents: 9999 });
      expect(t.grandTotalCents).toBe(0);
    });

    it("computes VAT per line per treatment", () => {
      const t = computeSaleTotals([line({ taxTreatment: "vat_exclusive", priceCents: 1000 })]);
      expect(t.taxTotalCents).toBe(160);
      expect(t.grandTotalCents).toBe(1160);
      expect(t.subtotalCents).toBe(1000);
    });
  });
});
