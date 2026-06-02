/**
 * SKU → Woo product-id mapping admin model (Story 29.5 / P4-E04-S05, AC5).
 *
 * The catalogue admin lists each local product with its `woo_product_id` for
 * manual entry, supports clearing a mapping (back to "in-store only"), and a bulk
 * CSV import. The push (`stock-push.ts`) is keyed off this mapping: an unmapped
 * product's push is a no-op (AC2). This module owns only the local mutations — it
 * never reads Woo.
 */
import { asc, eq } from "drizzle-orm";
import { products } from "@bm/db";
import {
  parseSkuMappingCsv,
  type SkuMappingCsvError,
  type SkuMappingRow,
} from "@bm/contracts";
import type { Database, Transaction, ProductRow } from "@bm/db";

type Executor = Database | Transaction;

/** List every active product with its current Woo mapping (AC5), SKU-ordered. */
export async function listSkuMappings(db: Executor): Promise<SkuMappingRow[]> {
  const rows = await db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      stockQty: products.stockQty,
      wooProductId: products.wooProductId,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.sku));
  return rows.map((r) => ({
    productId: r.productId,
    sku: r.sku,
    name: r.name,
    stockQty: r.stockQty,
    wooProductId: r.wooProductId,
  }));
}

export interface UpdateSkuMappingInput {
  productId: string;
  /** The Woo product id to map, or null to unmap (back to in-store only). */
  wooProductId: number | null;
}

/**
 * Manually set (or clear) one product's Woo mapping (AC5). Returns the updated
 * product row, or null when no product matched the id.
 */
export async function updateSkuMapping(
  db: Executor,
  input: UpdateSkuMappingInput,
): Promise<ProductRow | null> {
  const [row] = await db
    .update(products)
    .set({ wooProductId: input.wooProductId, updatedAt: new Date() })
    .where(eq(products.id, input.productId))
    .returning();
  return row ?? null;
}

export interface ApplySkuMappingCsvResult {
  /** Number of products whose mapping was set/cleared by the import. */
  applied: number;
  /** Per-line errors: parse errors + unknown-SKU rows (never throws). */
  errors: SkuMappingCsvError[];
}

/**
 * Bulk-apply a SKU-mapping CSV (AC5): parse it, then for each valid row look up
 * the product by SKU and set (or clear) its `woo_product_id`. A row whose SKU is
 * not found in the catalogue is reported as an error (not applied); parse errors
 * are passed through. The apply continues past a bad row — the result reports the
 * count applied + every collected error.
 */
export async function applySkuMappingCsv(
  db: Executor,
  csv: string,
): Promise<ApplySkuMappingCsvResult> {
  const { rows, errors } = parseSkuMappingCsv(csv);
  const collected: SkuMappingCsvError[] = [...errors];
  let applied = 0;

  for (const row of rows) {
    const updated = await db
      .update(products)
      .set({ wooProductId: row.wooProductId, updatedAt: new Date() })
      .where(eq(products.sku, row.sku))
      .returning({ id: products.id });
    if (updated.length === 0) {
      collected.push({ line: row.line, message: `Unknown SKU "${row.sku}"` });
      continue;
    }
    applied += 1;
  }

  return { applied, errors: collected };
}
