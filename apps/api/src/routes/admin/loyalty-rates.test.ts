import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, loyaltyRates, auditOutbox } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";
import type { FastifyInstance } from "fastify";

const ADMIN_PHONE = "+254700000000";
const ADMIN_PIN = "1234";
const STAFF_PHONE = "+254711111111";
const STAFF_PIN = "5678";

/**
 * P2-E05-S02 — admin-configurable, effective-dated loyalty rates.
 */
describe("admin loyalty rates API (P2-E05-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let adminCookie: string;
  let csrfToken: string;

  async function login(phone: string, pin: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    const cookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { cookie, csrfToken: res.json().csrfToken as string };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
    await dbh.db
      .insert(users)
      .values({ phone: ADMIN_PHONE, pinHash: await hashPin(ADMIN_PIN), role: "admin" });
    const a = await login(ADMIN_PHONE, ADMIN_PIN);
    adminCookie = a.cookie;
    csrfToken = a.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the seeded default rates (AC1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/loyalty/rates",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ earnRate: 100, redeemRate: 1 });
  });

  it("appends a new effective-dated rate for an admin (AC2) and audits it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/loyalty/rates",
      headers: { cookie: adminCookie, "x-csrf-token": csrfToken },
      payload: { rateType: "earn", value: 50 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().value).toBe(50);

    const rows = await dbh.db
      .select()
      .from(loyaltyRates)
      .where(eq(loyaltyRates.rateType, "earn"));
    expect(rows).toHaveLength(2); // seed + new (prior row not mutated)

    const logs = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "loyalty.rate_change"));
    expect(logs).toHaveLength(1);
  });

  it("rejects an invalid rate value (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/loyalty/rates",
      headers: { cookie: adminCookie, "x-csrf-token": csrfToken },
      payload: { rateType: "earn", value: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown rateType (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/loyalty/rates",
      headers: { cookie: adminCookie, "x-csrf-token": csrfToken },
      payload: { rateType: "bonus", value: 5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unauthenticated read (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/loyalty/rates" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a non-admin staff member from changing rates", async () => {
    await dbh.db
      .insert(users)
      .values({ phone: STAFF_PHONE, pinHash: await hashPin(STAFF_PIN), role: "reception" });
    const staff = await login(STAFF_PHONE, STAFF_PIN);
    const res = await app.inject({
      method: "POST",
      url: "/admin/loyalty/rates",
      headers: { cookie: staff.cookie, "x-csrf-token": staff.csrfToken },
      payload: { rateType: "earn", value: 50 },
    });
    expect(res.statusCode).toBe(403);
  });
});
