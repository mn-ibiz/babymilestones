import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, LoginRateLimiter, hashPin, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

describe("POST /auth/staff/login (P1-E01-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let rateLimiter: LoginRateLimiter;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    rateLimiter = new LoginRateLimiter();
    app = buildApp({ db: dbh.db, sessions, rateLimiter });
    // A reception staffer (PIN 7421) and a parent (PIN 1357).
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values({ phone: "+254712345678", pinHash: await hashPin("1357") });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const staffLogin = (body: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    app.inject({ method: "POST", url: "/auth/staff/login", payload: body });

  it("staff phone + PIN → 200, role-based landing, SSO cookie, audit (AC1, AC2, AC4, AC5)", async () => {
    const res = await staffLogin({ phone: "0712000001", pin: "7421" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: "reception", redirect: "/reception" });

    // AC4: same cookie machinery (HttpOnly/Secure/SameSite) scoped to the apex domain.
    const cookie = res.headers["set-cookie"] as string;
    expect(cookie).toMatch(/bm_session=.*Domain=\.babymilestones\.co\.ke.*HttpOnly.*Secure/u);
    const token = cookie.match(/bm_session=([^;]+)/u)![1]!;
    const [staff] = await dbh.db.select().from(users).where(eq(users.phone, "+254712000001"));
    expect((await sessions.get(token))?.userId).toBe(staff!.id);

    // AC5: auth.staff.login is audited; never the PIN.
    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.staff.login");
    expect(events[0]!.actorUserId).toBe(staff!.id);
    expect(JSON.stringify(events[0]!.payload)).not.toContain("7421");
  });

  it("admin-family roles land on /admin (AC2)", async () => {
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "8531", "treasury"));
    const res = await staffLogin({ phone: "0712000002", pin: "8531" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: "treasury", redirect: "/admin" });
  });

  it("a parent CANNOT use the staff flow (flow isolation, AC1)", async () => {
    const res = await staffLogin({ phone: "0712345678", pin: "1357" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Not a staff account" });
    // No staff session was issued.
    expect(res.headers["set-cookie"]).toBeUndefined();
    // A staff-login failure for a non-staff account is audited.
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "auth.staff.login.failure")).toBe(true);
  });

  it("wrong PIN for a staff phone → 401 generic, failure audit (AC1, AC5)", async () => {
    const res = await staffLogin({ phone: "0712000001", pin: "0000" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid credentials" });
    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.staff.login.failure");
    expect(JSON.stringify(events[0]!.payload)).not.toContain("0000");
  });

  it("unknown phone → identical 401 as wrong PIN (anti-enumeration)", async () => {
    const res = await staffLogin({ phone: "0700000000", pin: "7421" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid credentials" });
  });

  it("invalid phone format → 400, no audit", async () => {
    const res = await staffLogin({ phone: "123", pin: "7421" });
    expect(res.statusCode).toBe(400);
    expect(await dbh.db.select().from(auditOutbox)).toHaveLength(0);
  });

  it("rate-limits repeated staff failures (AC parity with parent flow)", async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await staffLogin({ phone: "0712000001", pin: "0001" });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await staffLogin({ phone: "0712000001", pin: "0001" });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("staff CANNOT log in through the parent phone+PIN flow (flow isolation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone: "0712000001", pin: "7421" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
