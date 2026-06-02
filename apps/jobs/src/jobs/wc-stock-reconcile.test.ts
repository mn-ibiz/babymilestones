import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, products, wcStockReconciliations } from "@bm/db";
import type { WooProduct } from "@bm/contracts";
import { createWcStockReconcileJob } from "./wc-stock-reconcile.js";

/**
 * Story 29.5 (P4-E04-S05, AC6) — the nightly stock-reconciliation job. Compares
 * local vs Woo stock for mapped products, persists a drift report, and writes a
 * single summary audit line. Reading Woo is comparison-only — local stock is
 * never overwritten.
 */
describe("wc-stock-reconcile job (Story 29.5)", () => {
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

  const client = (stockById: Record<number, number | null>) => ({
    getProduct: async (id: number): Promise<WooProduct> => ({
      id,
      name: `woo-${id}`,
      stock_quantity: stockById[id] ?? null,
    }),
  });

  it("runs nightly at midnight cadence", () => {
    const job = createWcStockReconcileJob({ db: dbh.db, client: client({}) });
    expect(job.name).toBe("wc-stock-reconcile");
    expect(job.cron).toBe("0 0 * * *");
  });

  it("persists a drift report + a summary audit line (AC6)", async () => {
    await make("BM-DRIFT", 3, 100); // local 3 vs woo 8 → delta -5
    await make("BM-OK", 10, 200); // in sync
    const job = createWcStockReconcileJob({ db: dbh.db, client: client({ 100: 8, 200: 10 }), now: () => NOW });
    await job.run();

    const reports = await dbh.db.select().from(wcStockReconciliations);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.comparedCount).toBe(2);
    expect(reports[0]!.drift).toHaveLength(1);

    const events = await dbh.db.select().from(auditOutbox);
    const summary = events.find((e) => e.action === "woocommerce.stock.reconciled");
    expect(summary).toBeTruthy();
    expect(summary!.payload).toMatchObject({ compared: 2, drifted: 1 });
  });

  it("does not write Woo stock back into local (AC6)", async () => {
    await make("BM-X", 3, 300);
    const job = createWcStockReconcileJob({ db: dbh.db, client: client({ 300: 99 }), now: () => NOW });
    await job.run();
    const [fresh] = await dbh.db.select().from(products);
    expect(fresh!.stockQty).toBe(3);
  });
});
