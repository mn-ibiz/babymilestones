import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { products, wcOutbox, auditOutbox } from "@bm/db";
import { createProduct } from "./products.js";
import { adjustStock } from "./stock-adjustments.js";

/** Read the stock-push request payload as a plain object (catalog has no contracts dep). */
type StockPushReq = { wooProductId: number; stockQuantity: number; stockStatus: string };

/**
 * Story 29.5 (P4-E04-S05, AC1) — the non-POS stock-mutation paths: goods-received
 * / restock (positive delta), stock-take (set absolute), and a manual admin
 * adjustment (signed delta). Each updates LOCAL stock (the source of truth),
 * audits the mutation, and enqueues a coalesced Woo stock push for a mapped
 * product (no-op when unmapped).
 */
describe("catalog stock adjustments (Story 29.5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const mapped = async (sku: string, stockQty: number) => {
    const p = await createProduct(dbh.db, { sku, name: sku, priceCents: 100, stockQty });
    await dbh.db.update(products).set({ wooProductId: 8001 }).where(eq(products.id, p.id));
    return { ...p, wooProductId: 8001 };
  };

  const pushes = async () => dbh.db.select().from(wcOutbox).where(eq(wcOutbox.kind, "stock_push"));

  it("goods-received: applies a positive delta, audits, and enqueues a push (AC1)", async () => {
    const p = await mapped("GR-1", 10);
    const result = await adjustStock(dbh.db, {
      productId: p.id,
      reason: "goods_received",
      delta: 25,
      actorUserId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result?.stockQty).toBe(35);

    const rows = await pushes();
    expect(rows).toHaveLength(1);
    expect((rows[0]!.request as StockPushReq).stockQuantity).toBe(35);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "stock.adjusted")).toBe(true);
  });

  it("stock-take: sets an absolute quantity (AC1)", async () => {
    const p = await mapped("ST-1", 10);
    const result = await adjustStock(dbh.db, {
      productId: p.id,
      reason: "stock_take",
      setTo: 7,
      actorUserId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result?.stockQty).toBe(7);
    const rows = await pushes();
    expect((rows[0]!.request as StockPushReq).stockQuantity).toBe(7);
  });

  it("manual adjustment: applies a negative delta, never below zero (AC1)", async () => {
    const p = await mapped("MA-1", 3);
    const result = await adjustStock(dbh.db, {
      productId: p.id,
      reason: "manual",
      delta: -10,
      actorUserId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result?.stockQty).toBe(0); // clamped at zero
    const rows = await pushes();
    const req = rows[0]!.request as StockPushReq;
    expect(req.stockQuantity).toBe(0);
    expect(req.stockStatus).toBe("outofstock");
  });

  it("is a no-op push for an unmapped (in-store only) product (AC2)", async () => {
    const p = await createProduct(dbh.db, { sku: "LOCAL", name: "Shelf only", priceCents: 100, stockQty: 5 });
    const result = await adjustStock(dbh.db, { productId: p.id, reason: "goods_received", delta: 5, actorUserId: "11111111-1111-4111-8111-111111111111" });
    expect(result?.stockQty).toBe(10);
    expect(await pushes()).toHaveLength(0); // unmapped → no push
  });

  it("returns null for an unknown product", async () => {
    const result = await adjustStock(dbh.db, {
      productId: "00000000-0000-0000-0000-000000000000",
      reason: "manual",
      delta: 1,
      actorUserId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toBeNull();
  });
});
