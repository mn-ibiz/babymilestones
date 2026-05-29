import type { PosProduct } from "@bm/contracts";

/**
 * Pure POS product display + search helpers (P2-E04-S02). Kept dependency-free
 * and unit-tested so the `ProductSearch` component stays a thin render (mirrors
 * the `apps/admin/lib/*` convention).
 */

/** Min query length before the name search fires (mirrors the API/catalog gate). */
export const POS_SEARCH_MIN_QUERY = 2;

const KES = new Intl.NumberFormat("en-KE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer cents (KES * 100) as a `KES 1,234.56` string. */
export function formatKes(cents: number): string {
  return `KES ${KES.format(cents / 100)}`;
}

/** AC3: a product the cashier cannot sell (greyed out, blocked at checkout). */
export function isOutOfStock(product: Pick<PosProduct, "inStock">): boolean {
  return !product.inStock;
}

/** Short stock summary for a result row. */
export function stockLabel(product: Pick<PosProduct, "inStock" | "stockQty">): string {
  return product.inStock ? `In stock: ${product.stockQty}` : "Out of stock";
}

/** AC2: whether a (trimmed) query is long enough to run a name search. */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= POS_SEARCH_MIN_QUERY;
}
