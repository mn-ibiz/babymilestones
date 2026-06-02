import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { eq } from "drizzle-orm";
import { orderEvents, wcOrders, wcOutbox } from "@bm/db";
import { wcOrderStatusRequestSchema } from "@bm/contracts";
import { applyOrderTransition, transitionOutboxKey } from "./order-transitions.js";

/**
 * Story 29.2 (P4-E04-S02) — the order-status transition WRITE PATH. Each
 * transition: (a) updates `wc_orders.local_status`, (b) inserts ONE audit-grade
 * `order_events` row, (c) enqueues EXACTLY ONE `wc_outbox` writeback with the
 * mapped Woo status + the idempotency key (woo_order_id, local_status, attempt_id).
 * Woo is NEVER called synchronously — only enqueued (AC2/AC6).
 */
describe("applyOrderTransition write path (Story 29.2)", () => {
  let h: TestDb;
  const actor = "11111111-1111-1111-1111-111111111111";

  async function seedOrder(wooOrderId: number, localStatus: string): Promise<void> {
    await h.db.insert(wcOrders).values({
      wooOrderId,
      status: "processing",
      number: String(wooOrderId),
      localStatus: localStatus as never,
      payload: { id: wooOrderId },
    });
  }

  beforeEach(async () => {
    h = await createTestDb();
  });
  afterEach(async () => {
    await h.close();
  });

  it("builds a deterministic idempotency key (woo_order_id, local_status, attempt_id)", () => {
    expect(transitionOutboxKey(42, "packing", "attempt-abc")).toBe(
      "wc-order:42:packing:attempt-abc",
    );
  });

  it("updates local_status, inserts an order_events row and enqueues one wc_outbox row (AC2/AC3)", async () => {
    await seedOrder(100, "new");

    const result = await applyOrderTransition(h.db, {
      wooOrderId: 100,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-1",
    });
    expect(result.ok).toBe(true);

    // (a) local_status advanced.
    const [order] = await h.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 100));
    expect(order!.localStatus).toBe("packing");

    // (b) exactly one order_events row, audit-grade.
    const events = await h.db.select().from(orderEvents).where(eq(orderEvents.wooOrderId, 100));
    expect(events).toHaveLength(1);
    expect(events[0]!.fromStatus).toBe("new");
    expect(events[0]!.toStatus).toBe("packing");
    expect(events[0]!.actorUserId).toBe(actor);
    expect(events[0]!.kind).toBe("forward");
    expect(events[0]!.createdAt).toBeInstanceOf(Date);

    // (c) exactly one wc_outbox writeback with the mapped Woo status + idempotency key.
    const outbox = await h.db.select().from(wcOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.kind).toBe("order_status");
    expect(outbox[0]!.idempotencyKey).toBe("wc-order:100:packing:att-1");
    const req = wcOrderStatusRequestSchema.parse(outbox[0]!.request);
    expect(req.wooOrderId).toBe(100);
    expect(req.status).toBe("processing");
  });

  it("maps ready → processing WITH a note (AC3)", async () => {
    await seedOrder(101, "packing");
    await applyOrderTransition(h.db, {
      wooOrderId: 101,
      to: "ready",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-2",
    });
    const [row] = await h.db.select().from(wcOutbox);
    const req = wcOrderStatusRequestSchema.parse(row!.request);
    expect(req.status).toBe("processing");
    expect(req.note).toBeTruthy();
  });

  it("captures dispatch metadata into order_events + the enqueued note text (AC5)", async () => {
    await seedOrder(102, "ready");
    await applyOrderTransition(h.db, {
      wooOrderId: 102,
      to: "dispatched",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-3",
      dispatch: {
        riderName: "John Mwangi",
        vehicle: "KDA 123A",
        contact: "+254712345678",
        dispatchedAt: "2026-06-02T08:30:00.000Z",
      },
    });

    const [event] = await h.db.select().from(orderEvents).where(eq(orderEvents.wooOrderId, 102));
    const meta = event!.metadata as Record<string, unknown>;
    const dispatch = meta.dispatch as Record<string, unknown>;
    expect(dispatch.riderName).toBe("John Mwangi");
    expect(dispatch.vehicle).toBe("KDA 123A");
    expect(dispatch.contact).toBe("+254712345678");

    const [row] = await h.db.select().from(wcOutbox);
    const req = wcOrderStatusRequestSchema.parse(row!.request);
    expect(req.status).toBe("completed");
    expect(req.note).toContain("John Mwangi");
    expect(req.note).toContain("KDA 123A");
  });

  it("rejects a SKIP without touching local_status, events, or the outbox (AC4)", async () => {
    await seedOrder(103, "new");
    const result = await applyOrderTransition(h.db, {
      wooOrderId: 103,
      to: "ready",
      actorUserId: actor,
      role: "super_admin",
      attemptId: "att-4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");

    const [order] = await h.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 103));
    expect(order!.localStatus).toBe("new");
    expect(await h.db.select().from(orderEvents)).toHaveLength(0);
    expect(await h.db.select().from(wcOutbox)).toHaveLength(0);
  });

  it("rejects a reversal for a non-admin POS role (no writes) (AC4)", async () => {
    await seedOrder(104, "ready");
    const result = await applyOrderTransition(h.db, {
      wooOrderId: 104,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-5",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden");

    const [order] = await h.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 104));
    expect(order!.localStatus).toBe("ready");
    expect(await h.db.select().from(orderEvents)).toHaveLength(0);
    expect(await h.db.select().from(wcOutbox)).toHaveLength(0);
  });

  it("allows a reversal for an admin and records kind=reversal (AC4)", async () => {
    await seedOrder(105, "ready");
    const result = await applyOrderTransition(h.db, {
      wooOrderId: 105,
      to: "packing",
      actorUserId: actor,
      role: "admin",
      attemptId: "att-6",
    });
    expect(result.ok).toBe(true);
    const [order] = await h.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 105));
    expect(order!.localStatus).toBe("packing");
    const [event] = await h.db.select().from(orderEvents).where(eq(orderEvents.wooOrderId, 105));
    expect(event!.kind).toBe("reversal");
  });

  it("returns not_found when the order is not in the mirror", async () => {
    const result = await applyOrderTransition(h.db, {
      wooOrderId: 999,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-7",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("requires dispatch detail for a dispatched transition (AC5)", async () => {
    await seedOrder(106, "ready");
    const result = await applyOrderTransition(h.db, {
      wooOrderId: 106,
      to: "dispatched",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-8",
      // no dispatch detail
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dispatch_required");
    expect(await h.db.select().from(wcOutbox)).toHaveLength(0);
  });

  it("respects a configurable local→Woo status override (AC3)", async () => {
    await seedOrder(107, "new");
    await applyOrderTransition(h.db, {
      wooOrderId: 107,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-9",
      statusMap: { packing: "on-hold" },
    });
    const [row] = await h.db.select().from(wcOutbox);
    const req = wcOrderStatusRequestSchema.parse(row!.request);
    expect(req.status).toBe("on-hold");
  });

  it("does NOT call Woo synchronously — only enqueues (AC2/AC6)", async () => {
    // The write path takes no Woo client argument by construction; the outbox row
    // is the only side effect. Re-running with the SAME attemptId is idempotent on
    // the outbox key (a second enqueue is a no-op).
    await seedOrder(108, "new");
    await applyOrderTransition(h.db, {
      wooOrderId: 108,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-dupe",
    });
    // A duplicate transition with the same target/attempt keeps a single outbox row.
    await h.db.update(wcOrders).set({ localStatus: "new" }).where(eq(wcOrders.wooOrderId, 108));
    await applyOrderTransition(h.db, {
      wooOrderId: 108,
      to: "packing",
      actorUserId: actor,
      role: "cashier",
      attemptId: "att-dupe",
    });
    const outbox = await h.db.select().from(wcOutbox).where(eq(wcOutbox.idempotencyKey, "wc-order:108:packing:att-dupe"));
    expect(outbox).toHaveLength(1);
  });
});
