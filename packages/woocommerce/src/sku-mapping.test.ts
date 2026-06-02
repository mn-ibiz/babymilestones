import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { products, type ProductRow } from "@bm/db";
import {
  listSkuMappings,
  updateSkuMapping,
  applySkuMappingCsv,
} from "./sku-mapping.js";

/**
 * Story 29.5 (P4-E04-S05, AC5) — the SKU-mapping admin model. DB-backed via
 * PGlite. Covers the list (every local product + its `woo_product_id`), the
 * single manual-entry update, and the bulk CSV apply (parse + apply + per-row
 * error reporting).
 */
describe("SKU-mapping admin model (Story 29.5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
    // Clear the migration's stub seed for a deterministic list.
    await dbh.db.delete(products);
  });
  afterEach(async () => {
    await dbh.close();
  });

  const make = async (sku: string, name: string, wooProductId?: number): Promise<ProductRow> => {
    const [row] = await dbh.db
      .insert(products)
      .values({ sku, name, priceCents: 100, stockQty: 5, wooProductId: wooProductId ?? null })
      .returning();
    return row!;
  };

  it("lists each active product with its woo_product_id (AC5)", async () => {
    await make("BM-A", "Alpha", 1001);
    await make("BM-B", "Bravo"); // unmapped → in-store only
    const rows = await listSkuMappings(dbh.db);
    expect(rows.map((r) => ({ sku: r.sku, wooProductId: r.wooProductId }))).toEqual([
      { sku: "BM-A", wooProductId: 1001 },
      { sku: "BM-B", wooProductId: null },
    ]);
  });

  it("updates a single product's mapping (manual entry) (AC5)", async () => {
    const p = await make("BM-A", "Alpha");
    const updated = await updateSkuMapping(dbh.db, { productId: p.id, wooProductId: 2002 });
    expect(updated?.wooProductId).toBe(2002);
    const [fresh] = await dbh.db.select().from(products).where(eq(products.id, p.id));
    expect(fresh!.wooProductId).toBe(2002);
  });

  it("clears a mapping when set to null (back to in-store only) (AC5)", async () => {
    const p = await make("BM-A", "Alpha", 2002);
    await updateSkuMapping(dbh.db, { productId: p.id, wooProductId: null });
    const [fresh] = await dbh.db.select().from(products).where(eq(products.id, p.id));
    expect(fresh!.wooProductId).toBeNull();
  });

  it("returns null updating a product that does not exist (AC5)", async () => {
    const updated = await updateSkuMapping(dbh.db, {
      productId: "00000000-0000-0000-0000-000000000000",
      wooProductId: 1,
    });
    expect(updated).toBeNull();
  });

  it("bulk CSV import applies valid rows by SKU + reports unknown SKUs (AC5)", async () => {
    const a = await make("BM-A", "Alpha");
    const b = await make("BM-B", "Bravo", 9999);
    const csv = [
      "sku,woo_product_id",
      "BM-A,3003", // map
      "BM-B,", // unmap
      "BM-GHOST,4004", // unknown SKU → reported, not applied
      ",55", // blank SKU → parse error
    ].join("\n");

    const result = await applySkuMappingCsv(dbh.db, csv);
    expect(result.applied).toBe(2);
    // unknown SKU + the blank-SKU parse error are both reported
    expect(result.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("BM-GHOST")]),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const [freshA] = await dbh.db.select().from(products).where(eq(products.id, a.id));
    const [freshB] = await dbh.db.select().from(products).where(eq(products.id, b.id));
    expect(freshA!.wooProductId).toBe(3003);
    expect(freshB!.wooProductId).toBeNull();
  });
});
