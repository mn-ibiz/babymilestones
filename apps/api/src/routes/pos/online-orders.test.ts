import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { users, wcOrders } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Story 29.1 (P4-E04-S01) — POS Online-orders read endpoint. Reads ONLY from the
 * local `wc_orders` mirror (AC5 — never a live Woo call), gated to the till roles
 * (`read product`), returns cards New-first (AC2) with masked phone + extracted
 * display fields (AC3) + the Woo id and last-synced stamp (AC6).
 */
describe("GET /pos/online-orders (Story 29.1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  async function login(phone: string, pin: string): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  }

  function payload(id: number): Record<string, unknown> {
    return {
      id,
      status: "processing",
      number: String(id),
      total: "1000.00",
      currency: "KES",
      billing: { first_name: "Asha", last_name: "Otieno", phone: "+254712345678" },
      shipping_lines: [{ method_id: "flat_rate", method_title: "Boda delivery" }],
      payment_method_title: "M-Pesa",
      date_paid: "2026-06-01T10:02:00",
      line_items: [{ id: 1, name: "Baby carrier", quantity: 2 }],
    };
  }

  async function seed(id: number, localStatus: string, updatedAt: string) {
    await dbh.db.insert(wcOrders).values({
      wooOrderId: id,
      status: "processing",
      number: String(id),
      total: "1000.00",
      currency: "KES",
      localStatus: localStatus as never,
      payload: payload(id),
      updatedAt: new Date(updatedAt),
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254700000009", "1212", "treasury"));
  });

  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("rejects an unauthenticated request (auth)", async () => {
    const res = await app.inject({ method: "GET", url: "/pos/online-orders" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a non-POS role (treasury)", async () => {
    const cookie = await login("+254700000009", "1212");
    const res = await app.inject({ method: "GET", url: "/pos/online-orders", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  describe("as a cashier", () => {
    let cookie: string;
    beforeEach(async () => {
      cookie = await login("+254712000001", "7421");
    });

    it("returns the mirror orders New-first with masked phone + Woo id (AC2/AC3/AC5/AC6)", async () => {
      await seed(1, "fulfilled", "2026-06-01T09:00:00Z");
      await seed(2, "new", "2026-06-01T10:00:00Z");

      const res = await app.inject({ method: "GET", url: "/pos/online-orders", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const orders = res.json().orders as Array<Record<string, unknown>>;
      expect(orders).toHaveLength(2);
      expect(orders[0]!.localStatus).toBe("new");
      expect(orders[0]!.wooOrderId).toBe(2);
      expect(orders[0]!.customerPhoneLast4).toBe("••••5678");
      expect(orders[0]!.deliveryMethod).toBe("Boda delivery");
      expect(orders[0]!.paymentStatus).toBe("paid");
      expect(orders[0]!.lastSyncedAt).toBe("2026-06-01T10:00:00.000Z");
    });

    it("returns an empty list when the mirror is empty", async () => {
      const res = await app.inject({ method: "GET", url: "/pos/online-orders", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.json().orders).toEqual([]);
    });
  });
});
