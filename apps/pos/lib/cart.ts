import { computeSaleTotals, type OverallDiscount, type PosProduct } from "@bm/contracts";

/**
 * Pure POS cart model (P2-E04-S03). Kept dependency-free and unit-tested so the
 * cart UI stays a thin render. The money math itself lives in `@bm/contracts`
 * (`computeSaleTotals`) so the API computes authoritative totals from the SAME
 * implementation; this module owns the cart's mutable model + operations and
 * delegates totals to that shared function.
 *
 * All amounts are integer cents (KES * 100).
 */

export type { OverallDiscount };

export interface CartLine {
  product: PosProduct;
  qty: number;
  /** Per-line discount percentage, 0..100. */
  lineDiscountPct: number;
}

export interface Cart {
  lines: CartLine[];
  overall: OverallDiscount;
}

export const emptyCart: Cart = { lines: [], overall: { kind: "none" } };

/** Clamp to [lo, hi]; a non-finite input (NaN from a bad keystroke) → lo. */
const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

/**
 * Add a product — merges into the existing line (qty + 1) if already present,
 * refreshing the stored product snapshot so a re-scan picks up the latest
 * price/stock rather than transacting on a stale first snapshot.
 */
export function addProduct(cart: Cart, product: PosProduct): Cart {
  const existing = cart.lines.find((l) => l.product.id === product.id);
  if (existing) {
    return mapLine(cart, product.id, (l) => ({ ...l, product, qty: l.qty + 1 }));
  }
  return { ...cart, lines: [...cart.lines, { product, qty: 1, lineDiscountPct: 0 }] };
}

function mapLine(cart: Cart, productId: string, fn: (line: CartLine) => CartLine): Cart {
  return { ...cart, lines: cart.lines.map((l) => (l.product.id === productId ? fn(l) : l)) };
}

/** Set an explicit quantity (floored, min 1; non-finite → 1). */
export function setQty(cart: Cart, productId: string, qty: number): Cart {
  const next = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
  return mapLine(cart, productId, (l) => ({ ...l, qty: next }));
}

export function incrementQty(cart: Cart, productId: string): Cart {
  return mapLine(cart, productId, (l) => ({ ...l, qty: l.qty + 1 }));
}

export function decrementQty(cart: Cart, productId: string): Cart {
  return mapLine(cart, productId, (l) => ({ ...l, qty: Math.max(1, l.qty - 1) }));
}

export function removeLine(cart: Cart, productId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.product.id !== productId) };
}

/** Set a per-line discount %, clamped to 0..100. */
export function setLineDiscountPct(cart: Cart, productId: string, pct: number): Cart {
  const next = clamp(pct, 0, 100);
  return mapLine(cart, productId, (l) => ({ ...l, lineDiscountPct: next }));
}

/** Set the overall discount, normalising/clamping its value. */
export function setOverallDiscount(cart: Cart, overall: OverallDiscount): Cart {
  if (overall.kind === "pct") {
    return { ...cart, overall: { kind: "pct", value: clamp(overall.value, 0, 100) } };
  }
  if (overall.kind === "kes") {
    const cents = Number.isFinite(overall.valueCents) ? Math.max(0, Math.round(overall.valueCents)) : 0;
    return { ...cart, overall: { kind: "kes", valueCents: cents } };
  }
  return { ...cart, overall: { kind: "none" } };
}

export interface CartLineTotal {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineDiscountPct: number;
  treatment: PosProduct["taxTreatment"];
  /** List price for the line (unitPrice * qty), pre-discount, native frame. */
  listLineCents: number;
  /** Discounted line amount (line + overall discount applied), native frame. */
  discountedLineCents: number;
  netCents: number;
  taxCents: number;
  /** What the customer pays for this line (net + tax for exclusive; gross otherwise). */
  grossCents: number;
}

export interface CartTotals {
  lines: CartLineTotal[];
  /** Ex-VAT (net) sum of list line prices, pre-discount. */
  subtotalCents: number;
  /** Ex-VAT total discount applied (per-line + overall). */
  discountTotalCents: number;
  /** Sum of per-line VAT. */
  taxTotalCents: number;
  /** What the customer pays (= subtotal − discount + VAT). */
  grandTotalCents: number;
}

/**
 * Compute live cart totals (AC1/AC2/AC3) by delegating to the shared, tested
 * `@bm/contracts` `computeSaleTotals` (the same function the API uses for the
 * authoritative charge), then re-attaching each line's product identity for the
 * UI. Totals are ex-VAT so `subtotal − discount + VAT = total` for every
 * treatment.
 */
export function computeTotals(cart: Cart): CartTotals {
  const totals = computeSaleTotals(
    cart.lines.map((l) => ({
      priceCents: l.product.priceCents,
      qty: l.qty,
      lineDiscountPct: l.lineDiscountPct,
      taxTreatment: l.product.taxTreatment,
    })),
    cart.overall,
  );
  const lines: CartLineTotal[] = totals.lines.map((t, i) => {
    const line = cart.lines[i]!;
    return {
      productId: line.product.id,
      name: line.product.name,
      qty: line.qty,
      unitPriceCents: line.product.priceCents,
      lineDiscountPct: line.lineDiscountPct,
      treatment: line.product.taxTreatment,
      listLineCents: t.listLineCents,
      discountedLineCents: t.discountedLineCents,
      netCents: t.netCents,
      taxCents: t.taxCents,
      grossCents: t.grossCents,
    };
  });
  return {
    lines,
    subtotalCents: totals.subtotalCents,
    discountTotalCents: totals.discountTotalCents,
    taxTotalCents: totals.taxTotalCents,
    grandTotalCents: totals.grandTotalCents,
  };
}

export interface StockViolation {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

export interface StockCheck {
  ok: boolean;
  violations: StockViolation[];
}

/**
 * Stock check run at the Pay step (AC4): any line whose quantity exceeds the
 * product's on-hand stock blocks the sale. The authoritative re-check + stock
 * decrement happen server-side at payment (S04); this is the client-side guard.
 */
export function validateStock(cart: Cart): StockCheck {
  const violations: StockViolation[] = cart.lines
    .filter((l) => l.qty > l.product.stockQty)
    .map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      requested: l.qty,
      available: l.product.stockQty,
    }));
  return { ok: violations.length === 0, violations };
}
