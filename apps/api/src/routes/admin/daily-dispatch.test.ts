import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, orderEvents, users, wcOrders, wcOutboxDead } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P4-E04-S04 (Story 29.4) — daily dispatch report admin API. Integration via
 * app.inject with real staff sessions (+ CSRF). The read endpoint returns the
 * status counts + total value + pack/dispatch averages + sync-health count for the
 * chosen day, defaulting to today (AC2/AC4/AC5); the export endpoint returns the
 * same data as text/csv (AC3) and emits the `report.dispatch.export` audit event.
 * Gated to admin / super_admin / treasury (same posture as 27.x) — accountant/
 * reception 403, unauth 401.
 */
describe("Admin daily-dispatch report API (P4-E04-S04)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let wooSeq = 0;
  const nextWoo = () => 7_000 + wooSeq++;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const get = (url: string, creds: Creds) =>
    app.inject({
      method: "GET",
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
    });

  async function seedOrder(localStatus: string, total: string, createdAt: Date) {
    const wooOrderId = nextWoo();
    await dbh.db.insert(wcOrders).values({
      wooOrderId,
      status: "processing",
      total,
      currency: "KES",
      localStatus: localStatus as never,
      createdAt,
    });
    return wooOrderId;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the status counts + total value + averages + sync-health for the day (AC2/AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const day = new Date("2026-06-02T10:00:00Z");
    const o1 = await seedOrder("dispatched", "100.00", day);
    await seedOrder("packing", "25.00", day);
    await dbh.db.insert(orderEvents).values([
      { wooOrderId: o1, fromStatus: "new", toStatus: "packing", kind: "forward", createdAt: new Date("2026-06-02T08:00:00Z") },
      { wooOrderId: o1, fromStatus: "packing", toStatus: "ready", kind: "forward", createdAt: new Date("2026-06-02T08:05:00Z") },
      { wooOrderId: o1, fromStatus: "ready", toStatus: "dispatched", kind: "forward", createdAt: new Date("2026-06-02T08:15:00Z") },
    ]);
    await dbh.db.insert(wcOutboxDead).values([
      { idempotencyKey: "d1", kind: "order_status", status: "dead", lastError: "boom" },
    ]);

    const res = await get("/admin/daily-dispatch?date=2026-06-02", creds);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toBe("2026-06-02");
    const counts = Object.fromEntries(body.countsByStatus.map((c: { status: string; count: number }) => [c.status, c.count]));
    expect(counts.dispatched).toBe(1);
    expect(counts.packing).toBe(1);
    expect(body.totalOrders).toBe(2);
    expect(body.totalValueCents).toBe(125_00);
    expect(body.avgPackSeconds).toBe(300);
    expect(body.avgDispatchSeconds).toBe(600);
    expect(body.syncHealthCount).toBe(1);
  });

  it("defaults the date to today when omitted (AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/daily-dispatch", creds);
    expect(res.statusCode).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(res.json().date).toBe(today);
  });

  it("400s a malformed date", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await get("/admin/daily-dispatch?date=02-06-2026", creds);
    expect(res.statusCode).toBe(400);
  });

  it("exports the day as text/csv with a Content-Disposition + emits the audit action (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedOrder("dispatched", "42.00", new Date("2026-06-02T10:00:00Z"));

    const res = await get("/admin/daily-dispatch/export?date=2026-06-02", creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("daily_dispatch_2026-06-02.csv");
    const body = res.body;
    expect(body.split("\r\n")[0]).toBe("metric,value");
    expect(body).toContain("Dispatched,1");
    expect(body).toContain("Total value (KES),42.00");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "report.dispatch.export"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ date: "2026-06-02" });
  });

  it("allows admin / super_admin / treasury (AC2)", async () => {
    const url = "/admin/daily-dispatch?date=2026-06-02";
    expect((await get(url, await loginStaff("+254712000001", "7421"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000002", "7422"))).statusCode).toBe(200);
    expect((await get(url, await loginStaff("+254712000004", "7424"))).statusCode).toBe(200);
  });

  it("403s accountant + reception", async () => {
    const url = "/admin/daily-dispatch?date=2026-06-02";
    expect((await get(url, await loginStaff("+254712000005", "7425"))).statusCode).toBe(403);
    expect((await get(url, await loginStaff("+254712000003", "7423"))).statusCode).toBe(403);
  });

  it("403s the export for a non-permitted role", async () => {
    const res = await get("/admin/daily-dispatch/export?date=2026-06-02", await loginStaff("+254712000003", "7423"));
    expect(res.statusCode).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/daily-dispatch?date=2026-06-02" });
    expect(res.statusCode).toBe(401);
  });
});
