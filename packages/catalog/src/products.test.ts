import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import {
  PRODUCT_SEARCH_LIMIT,
  PRODUCT_SEARCH_MIN_QUERY,
  createProduct,
  findProductByCode,
  searchProductsByName,
} from "./products.js";

/**
 * P2-E04-S02 — product catalogue read for the POS. DB-backed via the PGlite
 * harness. The migration seeds a small stub set; these tests insert their own
 * known products and assert lookup by SKU/barcode (AC1) and name search (AC2),
 * including out-of-stock visibility (AC3 — out-of-stock products are still
 * returned so the UI can grey them out, not filtered away).
 */
describe("catalogue products (P2-E04-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("creates a product active and in stock by default shape", async () => {
    const p = await createProduct(dbh.db, {
      sku: "TST-1",
      barcode: "0000000000001",
      name: "Test Widget",
      priceCents: 12300,
      stockQty: 7,
    });
    expect(p.sku).toBe("TST-1");
    expect(p.priceCents).toBe(12300);
    expect(p.stockQty).toBe(7);
    expect(p.isActive).toBe(true);
    expect(p.taxTreatment).toBe("vat_exempt");
  });

  describe("findProductByCode (AC1 — SKU or barcode)", () => {
    beforeEach(async () => {
      await createProduct(dbh.db, {
        sku: "TST-SKU",
        barcode: "0000000000009",
        name: "Coded Item",
        priceCents: 5000,
        stockQty: 3,
      });
    });

    it("matches an exact SKU", async () => {
      const p = await findProductByCode(dbh.db, "TST-SKU");
      expect(p?.name).toBe("Coded Item");
    });

    it("matches an exact barcode", async () => {
      const p = await findProductByCode(dbh.db, "0000000000009");
      expect(p?.name).toBe("Coded Item");
    });

    it("returns null for an unknown code", async () => {
      expect(await findProductByCode(dbh.db, "NOPE")).toBeNull();
    });

    it("prefers a barcode match when one product's SKU equals another's barcode", async () => {
      // "COLLIDE" is product X's barcode AND product Y's SKU — a scan should ring
      // up the barcode owner deterministically.
      await createProduct(dbh.db, {
        sku: "X-SKU",
        barcode: "COLLIDE",
        name: "Barcode Owner",
        priceCents: 111,
        stockQty: 5,
      });
      await createProduct(dbh.db, {
        sku: "COLLIDE",
        barcode: "Y-BARCODE",
        name: "Sku Owner",
        priceCents: 222,
        stockQty: 5,
      });
      const p = await findProductByCode(dbh.db, "COLLIDE");
      expect(p?.name).toBe("Barcode Owner");
    });

    it("does not match an inactive (soft-deleted) product", async () => {
      await createProduct(dbh.db, {
        sku: "TST-OFF",
        barcode: "0000000000099",
        name: "Retired",
        priceCents: 100,
        stockQty: 5,
        isActive: false,
      });
      expect(await findProductByCode(dbh.db, "TST-OFF")).toBeNull();
      expect(await findProductByCode(dbh.db, "0000000000099")).toBeNull();
    });
  });

  describe("searchProductsByName (AC2 / AC3)", () => {
    beforeEach(async () => {
      await createProduct(dbh.db, { sku: "S-A", name: "Alpha Blanket", priceCents: 1000, stockQty: 5 });
      await createProduct(dbh.db, { sku: "S-B", name: "Alpha Bottle", priceCents: 2000, stockQty: 0 });
      await createProduct(dbh.db, { sku: "S-C", name: "Zeta Toy", priceCents: 3000, stockQty: 9 });
      await createProduct(dbh.db, {
        sku: "S-D",
        name: "Alpha Hidden",
        priceCents: 4000,
        stockQty: 5,
        isActive: false,
      });
    });

    it("finds active products by case-insensitive substring", async () => {
      const rows = await searchProductsByName(dbh.db, "alpha");
      const names = rows.map((r) => r.name).sort();
      expect(names).toEqual(["Alpha Blanket", "Alpha Bottle"]);
    });

    it("includes out-of-stock products (UI greys them, does not hide)", async () => {
      const rows = await searchProductsByName(dbh.db, "Alpha Bottle");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stockQty).toBe(0);
    });

    it("excludes inactive products", async () => {
      const rows = await searchProductsByName(dbh.db, "Alpha");
      expect(rows.some((r) => r.name === "Alpha Hidden")).toBe(false);
    });

    it("returns [] for a blank or too-short query", async () => {
      expect(await searchProductsByName(dbh.db, "")).toEqual([]);
      expect(await searchProductsByName(dbh.db, "a")).toEqual([]);
      expect(PRODUCT_SEARCH_MIN_QUERY).toBe(2);
    });

    it("treats % and _ as literals, not wildcards", async () => {
      const rows = await searchProductsByName(dbh.db, "100%");
      expect(rows).toEqual([]);
    });

    it("caps results at the search limit", async () => {
      for (let i = 0; i < PRODUCT_SEARCH_LIMIT + 5; i += 1) {
        await createProduct(dbh.db, {
          sku: `BULK-${i}`,
          name: `Bulkitem ${i}`,
          priceCents: 100,
          stockQty: 1,
        });
      }
      const rows = await searchProductsByName(dbh.db, "Bulkitem");
      expect(rows.length).toBe(PRODUCT_SEARCH_LIMIT);
    });
  });
});
