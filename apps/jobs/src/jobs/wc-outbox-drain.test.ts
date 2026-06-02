import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, wcOutbox, wcOutboxDead } from "@bm/db";
import { enqueueWcWriteback } from "@bm/woocommerce";
import { WooServerError, WooAuthFailed } from "@bm/woocommerce";
import { createWcOutboxDrainJob } from "./wc-outbox-drain.js";

/**
 * Story 29.7 (AC2, AC3, AC6) — the writeback outbox drain worker. Injected fake
 * Woo client (no network). Covers: FIFO order, bounded concurrency, retry on
 * 5xx, dead-letter on persistent 4xx, idempotent dispatch, and a single
 * summary-level audit (counts, not per-item).
 */
describe("WooCommerce outbox drain job (Story 29.7)", () => {
  let dbh: TestDb;
  const NOW = new Date("2026-06-02T12:00:00Z");
  const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  function statusReq(orderId: number, status: string) {
    return { wooOrderId: orderId, status };
  }
  function stockReq(productId: number, qty: number) {
    return { wooProductId: productId, stockQuantity: qty, stockStatus: "instock" as const };
  }

  it("registers a queue-drain job named wc-outbox-drain", () => {
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: { updateOrderStatus: async () => undefined as never, updateProductStock: async () => undefined as never },
      now: () => NOW,
      logger: silentLogger,
    });
    expect(job.name).toBe("wc-outbox-drain");
  });

  it("dispatches order-status + stock-push writebacks and marks them done (AC2)", async () => {
    await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "os:1",
      kind: "order_status",
      request: statusReq(1, "completed"),
      now: new Date("2026-06-02T11:00:00Z"),
    });
    await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "sp:9",
      kind: "stock_push",
      request: stockReq(9, 5),
      now: new Date("2026-06-02T11:01:00Z"),
    });

    const statusCalls: { id: number; status: string }[] = [];
    const stockCalls: { id: number; qty: number }[] = [];
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async (id: number, status: string) => {
          statusCalls.push({ id, status });
        },
        updateProductStock: async (id: number, qty: number) => {
          stockCalls.push({ id, qty });
        },
      },
      now: () => NOW,
      logger: silentLogger,
    });
    await job.run();

    expect(statusCalls).toEqual([{ id: 1, status: "completed" }]);
    expect(stockCalls).toEqual([{ id: 9, qty: 5 }]);
    const rows = await dbh.db.select().from(wcOutbox);
    expect(rows.every((r) => r.status === "done")).toBe(true);

    // AC6: a single summary audit row (counts, not per item).
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "woocommerce.writeback.processed"));
    expect(audits).toHaveLength(1);
    const p = audits[0]!.payload as Record<string, unknown>;
    expect(p.processed).toBe(2);
    expect(p.dead_lettered).toBe(0);
  });

  it("processes due rows oldest-first (FIFO) (AC2)", async () => {
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "a", kind: "order_status", request: statusReq(1, "completed"), now: new Date("2026-06-02T11:00:00Z") });
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "b", kind: "order_status", request: statusReq(2, "completed"), now: new Date("2026-06-02T11:05:00Z") });
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "c", kind: "order_status", request: statusReq(3, "completed"), now: new Date("2026-06-02T11:10:00Z") });

    const order: number[] = [];
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async (id: number) => {
          order.push(id);
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
      concurrency: 1, // serialise so the call order is observable
    });
    await job.run();
    expect(order).toEqual([1, 2, 3]);
  });

  it("respects bounded concurrency (never more than N in flight) (AC2)", async () => {
    for (let i = 0; i < 8; i++) {
      await enqueueWcWriteback(dbh.db, {
        idempotencyKey: `k${i}`,
        kind: "order_status",
        request: statusReq(i + 1, "completed"),
        now: new Date(`2026-06-02T11:0${i}:00Z`),
      });
    }
    let inFlight = 0;
    let maxInFlight = 0;
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight -= 1;
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
      concurrency: 3,
    });
    await job.run();
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // proves it actually parallelised
  });

  it("retries on a 5xx (retryable) failure — stays pending, backs off (AC3)", async () => {
    const row = await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "retry5xx",
      kind: "order_status",
      request: statusReq(1, "completed"),
      now: NOW,
    });
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async () => {
          throw new WooServerError("503", { status: 503 });
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
    });
    await job.run();

    const [after] = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.id, row.id));
    expect(after!.status).toBe("pending");
    expect(after!.attempts).toBe(1);
    expect(after!.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    const dead = await dbh.db.select().from(wcOutboxDead);
    expect(dead).toHaveLength(0);
  });

  it("dead-letters a persistent 4xx after one retry (AC3)", async () => {
    await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "auth4xx",
      kind: "order_status",
      request: statusReq(1, "completed"),
      now: NOW,
    });
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async () => {
          throw new WooAuthFailed("401", { status: 401 });
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
    });
    // First pass → one retry (still pending), second pass → dead-letter.
    await job.run();
    expect((await dbh.db.select().from(wcOutbox))[0]!.status).toBe("pending");
    await job.run();

    const live = await dbh.db.select().from(wcOutbox);
    expect(live).toHaveLength(0);
    const dead = await dbh.db.select().from(wcOutboxDead);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.idempotencyKey).toBe("auth4xx");
    expect(dead[0]!.lastError).toContain("401");

    // AC6: the summary audit on the dead-lettering pass reports the count.
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "woocommerce.writeback.processed"));
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const last = audits[audits.length - 1]!.payload as Record<string, unknown>;
    expect(last.dead_lettered).toBe(1);
  });

  it("does not pick a row whose backoff has not elapsed", async () => {
    const row = await enqueueWcWriteback(dbh.db, {
      idempotencyKey: "future",
      kind: "order_status",
      request: statusReq(1, "completed"),
      now: NOW,
    });
    await dbh.db
      .update(wcOutbox)
      .set({ nextAttemptAt: new Date("2026-06-02T13:00:00Z") })
      .where(eq(wcOutbox.id, row.id));
    let called = false;
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async () => {
          called = true;
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
    });
    await job.run();
    expect(called).toBe(false);
  });

  it("isolates a failing row so the rest of the batch still drains", async () => {
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "bad", kind: "order_status", request: statusReq(1, "completed"), now: new Date("2026-06-02T11:00:00Z") });
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "good", kind: "order_status", request: statusReq(2, "completed"), now: new Date("2026-06-02T11:01:00Z") });
    const job = createWcOutboxDrainJob({
      db: dbh.db,
      client: {
        updateOrderStatus: async (id: number) => {
          if (id === 1) throw new WooServerError("503", { status: 503 });
        },
        updateProductStock: async () => {},
      },
      now: () => NOW,
      logger: silentLogger,
    });
    await job.run();
    const rows = await dbh.db.select().from(wcOutbox);
    const byKey = new Map(rows.map((r) => [r.idempotencyKey, r.status]));
    expect(byKey.get("bad")).toBe("pending"); // backed off
    expect(byKey.get("good")).toBe("done");
  });
});
