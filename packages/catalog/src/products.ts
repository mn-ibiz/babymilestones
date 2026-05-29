import { and, asc, eq, sql } from "drizzle-orm";
import { products, type ProductRow, type TaxTreatment } from "@bm/db";
import type { Executor } from "./services.js";

/** Min query length before a name search runs (one char is too broad). */
export const PRODUCT_SEARCH_MIN_QUERY = 2;
/** Hard cap on rows returned from a name search — keeps the response bounded. */
export const PRODUCT_SEARCH_LIMIT = 20;

/** Input to {@link createProduct}. Price is integer cents; stock defaults to 0. */
export interface CreateProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  priceCents: number;
  stockQty?: number;
  taxTreatment?: TaxTreatment;
  isActive?: boolean;
}

/**
 * Create a product (P2-E04-S02). The full catalogue CRUD surface lands in
 * P4-E01; this exists so the stub seed + tests can insert products and the POS
 * read paths have rows to serve.
 */
export async function createProduct(db: Executor, input: CreateProductInput): Promise<ProductRow> {
  const [row] = await db
    .insert(products)
    .values({
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      priceCents: input.priceCents,
      stockQty: input.stockQty ?? 0,
      ...(input.taxTreatment ? { taxTreatment: input.taxTreatment } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    })
    .returning();
  return row!;
}

/**
 * Look up a single active product by an exact barcode OR SKU (P2-E04-S02 AC1) —
 * the scanner / keyed-code path. SKU and barcode are independently unique, so a
 * code could in principle match one product's barcode and a different product's
 * SKU; a scan is a barcode, so we resolve barcode-first to keep the result
 * deterministic (never an arbitrary `limit(1)` of an ambiguous OR). Inactive
 * (soft-deleted) products are never matched. Returns null when nothing matches.
 */
export async function findProductByCode(db: Executor, code: string): Promise<ProductRow | null> {
  const term = code.trim();
  if (term === "") return null;
  const [byBarcode] = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.barcode, term)))
    .limit(1);
  if (byBarcode) return byBarcode;
  const [bySku] = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.sku, term)))
    .limit(1);
  return bySku ?? null;
}

/** Escape ILIKE wildcards in user input so `%`/`_` are matched literally. */
function escapeLike(term: string): string {
  return term.replace(/([%_\\])/gu, "\\$1");
}

/**
 * Search active products by a case-insensitive name substring (P2-E04-S02 AC2).
 * Out-of-stock products are INCLUDED (the UI greys them out rather than hiding
 * them — AC3); inactive products are excluded. A query shorter than
 * {@link PRODUCT_SEARCH_MIN_QUERY} returns []. Capped at {@link PRODUCT_SEARCH_LIMIT}.
 */
export async function searchProductsByName(db: Executor, rawQuery: string): Promise<ProductRow[]> {
  const q = rawQuery.trim();
  if (q.length < PRODUCT_SEARCH_MIN_QUERY) return [];
  const term = `%${escapeLike(q)}%`;
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.name} ILIKE ${term}`))
    .orderBy(asc(products.name))
    .limit(PRODUCT_SEARCH_LIMIT);
}
