/**
 * Pure POS pricing math (P2-E04). Lives in `@bm/contracts` — which has no
 * `@bm/db` dependency — so BOTH the API (server-authoritative totals; never
 * trust client prices) and the POS client cart use one implementation. All
 * amounts are integer cents (KES * 100).
 *
 * The tax split mirrors `@bm/catalog`'s `computeLineTax` exactly (same 16% rate,
 * same rounding); discounts apply in each line's native price frame, then tax is
 * computed on the discounted amount. Totals are presented EX-VAT so the summary
 * reconciles for every treatment: `subtotal − discount + VAT = total`.
 */

export type TaxTreatment = "vat_inclusive" | "vat_exclusive" | "vat_exempt" | "zero_rated";

/** Kenyan standard VAT rate in basis points (16% = 1600). */
export const KENYA_VAT_RATE_BPS = 1600;

export interface LineTax {
  netCents: number;
  taxCents: number;
  grossCents: number;
}

/** Tax split for a line amount under its treatment (mirrors @bm/catalog.computeLineTax). */
export function computeLineTax(
  treatment: TaxTreatment,
  amountCents: number,
  rateBps: number = KENYA_VAT_RATE_BPS,
): LineTax {
  const amount = Math.round(amountCents);
  if (treatment === "vat_exempt" || treatment === "zero_rated") {
    return { netCents: amount, taxCents: 0, grossCents: amount };
  }
  if (treatment === "vat_exclusive") {
    const taxCents = Math.round((amount * rateBps) / 10_000);
    return { netCents: amount, taxCents, grossCents: amount + taxCents };
  }
  // vat_inclusive: back the tax portion out of the gross amount.
  const netCents = Math.round((amount * 10_000) / (10_000 + rateBps));
  return { netCents, taxCents: amount - netCents, grossCents: amount };
}

/** Overall (order-level) discount — a percentage, a flat KES amount, or none. */
export type OverallDiscount =
  | { kind: "none" }
  | { kind: "pct"; value: number }
  | { kind: "kes"; valueCents: number };

/** One line's pricing inputs (the minimum the math needs — no product identity). */
export interface SaleLineInput {
  priceCents: number;
  qty: number;
  lineDiscountPct: number;
  taxTreatment: TaxTreatment;
}

export interface SaleLineTotal {
  listLineCents: number;
  discountedLineCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
}

export interface SaleTotals {
  lines: SaleLineTotal[];
  /** Ex-VAT (net) sum of list line prices, pre-discount. */
  subtotalCents: number;
  /** Ex-VAT total discount applied (per-line + overall). */
  discountTotalCents: number;
  /** Sum of per-line VAT. */
  taxTotalCents: number;
  /** What the customer pays (= subtotal − discount + VAT). */
  grandTotalCents: number;
}

const clampPct = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

/**
 * Compute sale totals from raw line inputs + an overall discount. Per line:
 * list → minus line discount % → minus a share of the overall discount → tax on
 * the discounted amount. An overall KES discount is distributed proportionally
 * (largest-remainder, capped per line) and capped at the cart total.
 */
export function computeSaleTotals(
  lines: SaleLineInput[],
  overall: OverallDiscount = { kind: "none" },
  rateBps: number = KENYA_VAT_RATE_BPS,
): SaleTotals {
  const base = lines.map((l) => {
    const listLineCents = Math.round(l.priceCents) * Math.max(0, Math.floor(l.qty));
    const afterLine = Math.round((listLineCents * (100 - clampPct(l.lineDiscountPct))) / 100);
    return { line: l, listLineCents, afterLine };
  });

  const afterLineTotal = base.reduce((s, b) => s + b.afterLine, 0);
  const overallCents = resolveOverallCents(overall, afterLineTotal);
  const shares = distribute(
    overallCents,
    base.map((b) => b.afterLine),
  );

  let subtotalCents = 0;
  let discountTotalCents = 0;
  const out: SaleLineTotal[] = base.map((b, i) => {
    const discountedLineCents = Math.max(0, b.afterLine - shares[i]!);
    const tax = computeLineTax(b.line.taxTreatment, discountedLineCents, rateBps);
    const netListCents = computeLineTax(b.line.taxTreatment, b.listLineCents, rateBps).netCents;
    subtotalCents += netListCents;
    discountTotalCents += netListCents - tax.netCents;
    return {
      listLineCents: b.listLineCents,
      discountedLineCents,
      netCents: tax.netCents,
      taxCents: tax.taxCents,
      grossCents: tax.grossCents,
    };
  });

  const taxTotalCents = out.reduce((s, l) => s + l.taxCents, 0);
  const grandTotalCents = out.reduce((s, l) => s + l.grossCents, 0);
  return { lines: out, subtotalCents, discountTotalCents, taxTotalCents, grandTotalCents };
}

function resolveOverallCents(overall: OverallDiscount, afterLineTotal: number): number {
  if (overall.kind === "pct") return Math.round((afterLineTotal * clampPct(overall.value)) / 100);
  if (overall.kind === "kes") {
    const v = Number.isFinite(overall.valueCents) ? Math.max(0, Math.round(overall.valueCents)) : 0;
    return Math.min(v, afterLineTotal);
  }
  return 0;
}

/**
 * Split `total` cents across `weights` (largest-remainder, capped at each
 * weight) so the parts sum to exactly `min(total, Σweights)` and no part exceeds
 * its weight (so a line is never discounted below zero).
 */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const capped = Math.min(total, sum);
  const exact = weights.map((w) => (capped * w) / sum);
  const parts = exact.map((e) => Math.floor(e));
  let leftover = capped - parts.reduce((s, p) => s + p, 0);
  const order = weights
    .map((w, i) => ({ i, frac: exact[i]! - parts[i]!, cap: w - parts[i]! }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i, cap } of order) {
    if (leftover <= 0) break;
    if (cap > 0) {
      parts[i] = parts[i]! + 1;
      leftover -= 1;
    }
  }
  return parts;
}
