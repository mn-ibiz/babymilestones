import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { orderEvents, wcOrders, wcOutboxDead } from "@bm/db";
import { loadDailyDispatch } from "./daily-dispatch-db.js";

/**
 * P4-E04-S04 (Story 29.4) — DB read behind the daily dispatch report. DB-backed
 * via the PGlite harness. Verifies the read selects ONLY the WooCommerce-originated
 * `wc_orders` whose `created_at` falls on the report day (UTC `[date, date+1)`),
 * counts them by `local_status`, sums `total` (a Woo KES decimal string) to cents,
 * pulls each order's `order_events` for the pack/dispatch timings, and counts the
 * un-actioned dead-letter rows for the sync-health row (AC1/AC2/AC5).
 */
describe("loadDailyDispatch (Story 29.4)", () => {
  let dbh: TestDb;
  let wooSeq = 0;
  const nextWoo = () => 5_000 + wooSeq++;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedOrder(opts: {
    localStatus: string;
    total: string | null;
    createdAt: Date;
  }): Promise<number> {
    const wooOrderId = nextWoo();
    await dbh.db.insert(wcOrders).values({
      wooOrderId,
      status: "processing",
      total: opts.total,
      currency: "KES",
      localStatus: opts.localStatus as never,
      createdAt: opts.createdAt,
    });
    return wooOrderId;
  }

  async function seedEvent(opts: {
    wooOrderId: number;
    fromStatus: string;
    toStatus: string;
    kind?: string;
    createdAt: Date;
  }) {
    await dbh.db.insert(orderEvents).values({
      wooOrderId: opts.wooOrderId,
      fromStatus: opts.fromStatus as never,
      toStatus: opts.toStatus as never,
      kind: (opts.kind ?? "forward") as never,
      createdAt: opts.createdAt,
    });
  }

  it("counts the day's orders by status, sums KES total to cents, and computes averages", async () => {
    const inDay = new Date("2026-06-02T10:00:00Z");
    const o1 = await seedOrder({ localStatus: "dispatched", total: "100.50", createdAt: inDay });
    const o2 = await seedOrder({ localStatus: "packing", total: "20.00", createdAt: inDay });
    // An order created on a different day must be excluded.
    await seedOrder({ localStatus: "fulfilled", total: "999.00", createdAt: new Date("2026-06-01T10:00:00Z") });

    await seedEvent({ wooOrderId: o1, fromStatus: "new", toStatus: "packing", createdAt: new Date("2026-06-02T08:00:00Z") });
    await seedEvent({ wooOrderId: o1, fromStatus: "packing", toStatus: "ready", createdAt: new Date("2026-06-02T08:05:00Z") });
    await seedEvent({ wooOrderId: o1, fromStatus: "ready", toStatus: "dispatched", createdAt: new Date("2026-06-02T08:15:00Z") });
    await seedEvent({ wooOrderId: o2, fromStatus: "new", toStatus: "packing", createdAt: new Date("2026-06-02T09:00:00Z") });

    const report = await loadDailyDispatch(dbh.db, { date: "2026-06-02" });

    expect(report.date).toBe("2026-06-02");
    const counts = Object.fromEntries(report.countsByStatus.map((c) => [c.status, c.count]));
    expect(counts.dispatched).toBe(1);
    expect(counts.packing).toBe(1);
    expect(counts.fulfilled).toBe(0); // other-day order excluded
    expect(report.totalOrders).toBe(2);
    expect(report.totalValueCents).toBe(100_50 + 20_00);
    expect(report.avgPackSeconds).toBe(300); // o1 only: 5 min
    expect(report.avgDispatchSeconds).toBe(600); // o1 only: 10 min
  });

  it("counts only un-actioned dead-letter rows for the sync-health row (AC5)", async () => {
    await dbh.db.insert(wcOutboxDead).values([
      { idempotencyKey: "k1", kind: "order_status", status: "dead", lastError: "boom" },
      { idempotencyKey: "k2", kind: "order_status", status: "dead", lastError: "boom" },
      { idempotencyKey: "k3", kind: "order_status", status: "resolved", lastError: "boom" },
    ]);
    const report = await loadDailyDispatch(dbh.db, { date: "2026-06-02" });
    expect(report.syncHealthCount).toBe(2);
  });

  it("handles a zero-data day (no orders, no dead-letters)", async () => {
    const report = await loadDailyDispatch(dbh.db, { date: "2026-06-02" });
    expect(report.totalOrders).toBe(0);
    expect(report.totalValueCents).toBe(0);
    expect(report.avgPackSeconds).toBeNull();
    expect(report.avgDispatchSeconds).toBeNull();
    expect(report.syncHealthCount).toBe(0);
  });
});
