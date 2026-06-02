import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { products, wcOutbox, type ProductRow } from "@bm/db";
import { wcStockPushRequestSchema } from "@bm/contracts";
import { enqueueStockPush, STOCK_PUSH_DEBOUNCE_MS } from "./stock-push.js";

/**
 * Story 29.5 (P4-E04-S05) — the coalescing per-SKU stock-push enqueue. DB-backed
 * via PGlite. Covers the no-op-on-unmapped rule (AC2), the stock_status derivation
 * (AC3), and the per-SKU debounce/coalesce (AC4): N rapid mutations collapse to
 * ONE pending outbox row carrying the FINAL value.
 */
describe("stock-push enqueue (Story 29.5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  const T0 = new Date("2026-06-02T11:00:00Z");

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const pendingStockPushes = async () =>
    dbh.db.select().from(wcOutbox).where(eq(wcOutbox.kind, "stock_push"));

  const makeProduct = async (
    input: { sku: string; name: string; stockQty: number; wooProductId?: number },
  ): Promise<ProductRow> => {
    const [row] = await dbh.db
      .insert(products)
      .values({
        sku: input.sku,
        name: input.name,
        priceCents: 100,
        stockQty: input.stockQty,
        wooProductId: input.wooProductId ?? null,
      })
      .returning();
    return row!;
  };

  it("is a NO-OP when the product has no Woo mapping (AC2)", async () => {
    const p = await makeProduct({ sku: "INSTORE-1", name: "In-store only", stockQty: 9 });
    const result = await enqueueStockPush(dbh.db, { productId: p.id, now: T0 });
    expect(result).toBeNull();
    expect(await pendingStockPushes()).toHaveLength(0);
  });

  it("enqueues a push carrying the local stock + derived stock_status (AC3)", async () => {
    const p = await makeProduct({ sku: "MAP-1", name: "Mapped", stockQty: 7, wooProductId: 5001 });

    const row = await enqueueStockPush(dbh.db, { productId: p.id, now: T0 });
    expect(row).not.toBeNull();
    const req = wcStockPushRequestSchema.parse(row!.request);
    expect(req).toEqual({ wooProductId: 5001, stockQuantity: 7, stockStatus: "instock" });
  });

  it("sets stock_status=outofstock when local stock is 0 (AC3)", async () => {
    const p = await makeProduct({ sku: "MAP-0", name: "Empty", stockQty: 0, wooProductId: 5002 });

    const row = await enqueueStockPush(dbh.db, { productId: p.id, now: T0 });
    const req = wcStockPushRequestSchema.parse(row!.request);
    expect(req.stockStatus).toBe("outofstock");
    expect(req.stockQuantity).toBe(0);
  });

  it("collapses N rapid mutations into ONE pending push with the FINAL value (AC4)", async () => {
    const p = await makeProduct({ sku: "BURST", name: "Burst", stockQty: 100, wooProductId: 5003 });

    // Simulate a burst: each mutation decrements local stock then re-arms the push.
    for (const qty of [99, 98, 97, 96, 95]) {
      await dbh.db.update(products).set({ stockQty: qty }).where(eq(products.id, p.id));
      await enqueueStockPush(dbh.db, { productId: p.id, now: new Date(T0.getTime() + 100) });
    }

    const rows = await pendingStockPushes();
    expect(rows).toHaveLength(1); // exactly one coalesced row
    const req = wcStockPushRequestSchema.parse(rows[0]!.request);
    expect(req.stockQuantity).toBe(95); // the FINAL value wins
    expect(req.wooProductId).toBe(5003);
  });

  it("re-arms the debounce window on each mutation (AC4)", async () => {
    const p = await makeProduct({ sku: "REARM", name: "Rearm", stockQty: 50, wooProductId: 5004 });

    await enqueueStockPush(dbh.db, { productId: p.id, now: T0 });
    const later = new Date(T0.getTime() + 2_000);
    await dbh.db.update(products).set({ stockQty: 49 }).where(eq(products.id, p.id));
    await enqueueStockPush(dbh.db, { productId: p.id, now: later });

    const rows = await pendingStockPushes();
    expect(rows).toHaveLength(1);
    // The push becomes due `debounce` after the LAST mutation, not the first.
    expect(rows[0]!.nextAttemptAt.getTime()).toBe(later.getTime() + STOCK_PUSH_DEBOUNCE_MS);
  });
});
