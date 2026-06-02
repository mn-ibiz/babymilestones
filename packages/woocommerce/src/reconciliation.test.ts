import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { products, wcStockReconciliations } from "@bm/db";
import type { WooProduct } from "@bm/contracts";
import { reconcileStock, getLatestReconciliation } from "./reconciliation.js";

/**
 * Story 29.5 (P4-E04-S05, AC6) — the nightly stock reconciliation. Reads local
 * stock + Woo stock (via an injected client), compares MAPPED products, lists the
 * SKUs that have DRIFTED with correct deltas, omits in-sync SKUs, skips unmapped
 * products, and persists a snapshot. Reading Woo here is for comparison ONLY —
 * local stock is never overwritten.
 */
describe("stock reconciliation (Story 29.5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const NOW = new Date("2026-06-02T02:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
    await dbh.db.delete(products);
  });
  afterEach(async () => {
    await dbh.close();
  });

  const make = async (sku: string, stockQty: number, wooProductId?: number) => {
    await dbh.db
      .insert(products)
      .values({ sku, name: sku, priceCents: 100, stockQty, wooProductId: wooProductId ?? null });
  };

  /** A fake Woo client returning the configured stock_quantity per product id. */
  const fakeClient = (stockById: Record<number, number | null>) => ({
    getProduct: async (id: number): Promise<WooProduct> => ({
      id,
      name: `woo-${id}`,
      stock_quantity: stockById[id] ?? null,
    }),
  });

  it("reports only drifted SKUs with correct deltas; in-sync omitted; unmapped skipped (AC6)", async () => {
    await make("BM-INSYNC", 10, 100); // local 10, woo 10 → in sync (omitted)
    await make("BM-DRIFT-DOWN", 3, 200); // local 3, woo 8 → delta -5
    await make("BM-DRIFT-UP", 12, 300); // local 12, woo 4 → delta +8
    await make("BM-INSTORE", 7); // unmapped → skipped

    const client = fakeClient({ 100: 10, 200: 8, 300: 4 });
    const report = await reconcileStock(dbh.db, { client, now: NOW });

    expect(report.comparedCount).toBe(3); // only the 3 mapped products
    const bySku = Object.fromEntries(report.drift.map((d) => [d.sku, d]));
    expect(Object.keys(bySku).sort()).toEqual(["BM-DRIFT-DOWN", "BM-DRIFT-UP"]);
    expect(bySku["BM-DRIFT-DOWN"]!.delta).toBe(-5);
    expect(bySku["BM-DRIFT-UP"]!.delta).toBe(8);
    expect(bySku["BM-DRIFT-DOWN"]!.localStock).toBe(3);
    expect(bySku["BM-DRIFT-DOWN"]!.wooStock).toBe(8);
  });

  it("treats a null Woo stock_quantity as 0 for the delta (AC6)", async () => {
    await make("BM-NULLWOO", 4, 400); // local 4, woo null → delta +4
    const report = await reconcileStock(dbh.db, { client: fakeClient({ 400: null }), now: NOW });
    expect(report.drift).toHaveLength(1);
    expect(report.drift[0]!.delta).toBe(4);
    expect(report.drift[0]!.wooStock).toBeNull();
  });

  it("persists the report snapshot, read back newest-first (AC6)", async () => {
    await make("BM-DRIFT", 1, 500);
    await reconcileStock(dbh.db, { client: fakeClient({ 500: 9 }), now: NOW });

    const rows = await dbh.db
      .select()
      .from(wcStockReconciliations)
      .orderBy(desc(wcStockReconciliations.generatedAt));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.comparedCount).toBe(1);
    expect(rows[0]!.drift).toHaveLength(1);

    const latest = await getLatestReconciliation(dbh.db);
    expect(latest?.drift[0]!.sku).toBe("BM-DRIFT");
    expect(latest?.drift[0]!.delta).toBe(-8);
  });

  it("does NOT write Woo stock back into local stock (AC6)", async () => {
    await make("BM-X", 3, 600);
    await reconcileStock(dbh.db, { client: fakeClient({ 600: 99 }), now: NOW });
    const [fresh] = await dbh.db.select().from(products);
    expect(fresh!.stockQty).toBe(3); // unchanged — Woo read is comparison-only
  });

  it("returns an empty report with no mapped products", async () => {
    await make("BM-INSTORE", 7); // unmapped only
    const report = await reconcileStock(dbh.db, { client: fakeClient({}), now: NOW });
    expect(report.comparedCount).toBe(0);
    expect(report.drift).toEqual([]);
  });
});
