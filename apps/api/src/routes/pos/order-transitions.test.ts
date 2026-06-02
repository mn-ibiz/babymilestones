import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { eq } from "drizzle-orm";
import { auditOutbox, orderEvents, users, wcOrders, wcOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed, CSRF_HEADER_NAME } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Story 29.2 (P4-E04-S02) — POS order-status transition endpoint.
 * POST /pos/online-orders/:wooOrderId/transition
 *
 * Forward + cancel transitions are gated to the till roles (`read product`);
 * reversals (to an earlier status) require an admin role (AC4). Each transition
 * is audited and writes an order_events row + enqueues a wc_outbox writeback (AC2).
 */
describe("POST /pos/online-orders/:id/transition (Story 29.2)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  async function loginWithCsrf(phone: string, pin: string): Promise<{ cookie: string; csrf: string }> {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="));
    const csrf = csrfCookie ? csrfCookie.split(";")[0]!.split("=")[1]! : "";
    return { cookie: cookies.map((c) => c.split(";")[0]).join("; "), csrf };
  }

  async function seed(wooOrderId: number, localStatus: string): Promise<void> {
    await dbh.db.insert(wcOrders).values({
      wooOrderId,
      status: "processing",
      number: String(wooOrderId),
      localStatus: localStatus as never,
      payload: { id: wooOrderId },
    });
  }

  async function post(url: string, auth: { cookie: string; csrf: string }, body: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url,
      headers: { cookie: auth.cookie, [CSRF_HEADER_NAME]: auth.csrf },
      payload: body,
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "8531", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254700000009", "1212", "treasury"));
  });

  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("rejects an unauthenticated request (auth)", async () => {
    await seed(1, "new");
    const res = await app.inject({
      method: "POST",
      url: "/pos/online-orders/1/transition",
      payload: { action: "start_packing" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a non-POS role (treasury)", async () => {
    await seed(1, "new");
    const auth = await loginWithCsrf("+254700000009", "1212");
    const res = await post("/pos/online-orders/1/transition", auth, { action: "start_packing" });
    expect(res.statusCode).toBe(403);
  });

  describe("as a cashier (POS staff)", () => {
    let auth: { cookie: string; csrf: string };
    beforeEach(async () => {
      auth = await loginWithCsrf("+254712000001", "7421");
    });

    it("performs a forward transition: advances status, writes event + outbox, audits (AC1/AC2/AC3)", async () => {
      await seed(10, "new");
      const res = await post("/pos/online-orders/10/transition", auth, { action: "start_packing" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.localStatus).toBe("packing");

      const [order] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 10));
      expect(order!.localStatus).toBe("packing");

      const events = await dbh.db.select().from(orderEvents).where(eq(orderEvents.wooOrderId, 10));
      expect(events).toHaveLength(1);
      expect(events[0]!.toStatus).toBe("packing");

      const outbox = await dbh.db.select().from(wcOutbox);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]!.kind).toBe("order_status");

      const audits = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "woocommerce.order.transition"));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.actorUserId).toBeTruthy();
    });

    it("rejects a SKIP (new → mark_ready) with 422 and writes nothing (AC4)", async () => {
      await seed(11, "new");
      const res = await post("/pos/online-orders/11/transition", auth, { action: "mark_ready" });
      expect(res.statusCode).toBe(422);
      const [order] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 11));
      expect(order!.localStatus).toBe("new");
      expect(await dbh.db.select().from(orderEvents)).toHaveLength(0);
    });

    it("forbids a REVERSAL by a non-admin POS role with 403 (AC4)", async () => {
      await seed(12, "ready");
      const res = await post("/pos/online-orders/12/transition", auth, { action: "start_packing" });
      expect(res.statusCode).toBe(403);
      const [order] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 12));
      expect(order!.localStatus).toBe("ready");
    });

    it("requires dispatch detail for mark_dispatched (422) (AC5)", async () => {
      await seed(13, "ready");
      const res = await post("/pos/online-orders/13/transition", auth, { action: "mark_dispatched" });
      expect(res.statusCode).toBe(422);
    });

    it("captures dispatch detail into the event + Woo note (AC5)", async () => {
      await seed(14, "ready");
      const res = await post("/pos/online-orders/14/transition", auth, {
        action: "mark_dispatched",
        dispatch: { riderName: "John Mwangi", vehicle: "KDA 123A", contact: "+254712345678" },
      });
      expect(res.statusCode).toBe(200);
      const [event] = await dbh.db.select().from(orderEvents).where(eq(orderEvents.wooOrderId, 14));
      const meta = event!.metadata as Record<string, unknown>;
      expect((meta.dispatch as Record<string, unknown>).riderName).toBe("John Mwangi");
      const [row] = await dbh.db.select().from(wcOutbox);
      const req = row!.request as { status: string; note?: string };
      expect(req.status).toBe("completed");
      expect(req.note).toContain("John Mwangi");
    });

    it("allows cancel from a non-terminal status (AC1/AC4)", async () => {
      await seed(15, "packing");
      const res = await post("/pos/online-orders/15/transition", auth, { action: "cancel" });
      expect(res.statusCode).toBe(200);
      const [order] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 15));
      expect(order!.localStatus).toBe("cancelled");
    });

    it("404s an unknown order", async () => {
      const res = await post("/pos/online-orders/999/transition", auth, { action: "start_packing" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("as an admin", () => {
    let auth: { cookie: string; csrf: string };
    beforeEach(async () => {
      auth = await loginWithCsrf("+254712000002", "8531");
    });

    it("performs a reversal and records the reversal audit action (AC4)", async () => {
      await seed(20, "ready");
      const res = await post("/pos/online-orders/20/transition", auth, { action: "start_packing" });
      expect(res.statusCode).toBe(200);
      const [order] = await dbh.db.select().from(wcOrders).where(eq(wcOrders.wooOrderId, 20));
      expect(order!.localStatus).toBe("packing");

      const audits = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "woocommerce.order.transition_reversed"));
      expect(audits).toHaveLength(1);
    });
  });
});
