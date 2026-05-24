import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, LoginRateLimiter, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

describe("POST /auth/login (P1-E01-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let rateLimiter: LoginRateLimiter;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    rateLimiter = new LoginRateLimiter();
    app = buildApp({ db: dbh.db, sessions, rateLimiter });
    // Seed a parent (PIN 1357).
    await dbh.db.insert(users).values({ phone: "+254712345678", pinHash: await hashPin("1357") });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const login = (body: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    app.inject({ method: "POST", url: "/auth/login", payload: body });

  it("correct phone + PIN → 200, session cookie, dashboard redirect, audit (AC1, AC5)", async () => {
    const res = await login({ phone: "0712345678", pin: "1357" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ redirect: "/dashboard" });

    const cookie = res.headers["set-cookie"] as string;
    expect(cookie).toMatch(/bm_session=.*HttpOnly.*Secure.*SameSite=Lax/u);
    const token = cookie.match(/bm_session=([^;]+)/u)![1]!;
    const [user] = await dbh.db.select().from(users);
    expect((await sessions.get(token))?.userId).toBe(user!.id);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.login.success");
    expect(events[0]!.actorUserId).toBe(user!.id);
    expect(JSON.stringify(events[0]!.payload)).not.toContain("1357"); // AC5: no PIN
  });

  it("wrong PIN → 401 generic 'Invalid credentials', failure audit (AC2, AC5)", async () => {
    const res = await login({ phone: "0712345678", pin: "9999" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid credentials" });
    // No field disclosure.
    expect(JSON.stringify(res.json())).not.toMatch(/phone|pin/iu);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.login.failure");
    expect(JSON.stringify(events[0]!.payload)).not.toContain("9999");
  });

  it("unknown phone → identical error + status as wrong PIN (AC4)", async () => {
    const res = await login({ phone: "0700000000", pin: "1357" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid credentials" });
    // Failure is audited with no resolvable user.
    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.login.failure");
    expect(events[0]!.actorUserId).toBeNull();
  });

  it("5 failures then 6th → 429 with Retry-After (AC3)", async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await login({ phone: "0712345678", pin: "0001" });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await login({ phone: "0712345678", pin: "0001" });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // Even a CORRECT PIN is blocked while rate-limited.
    const blockedOk = await login({ phone: "0712345678", pin: "1357" });
    expect(blockedOk.statusCode).toBe(429);
  });

  it("successful login resets the failure counter (AC3)", async () => {
    for (let i = 0; i < 4; i += 1) await login({ phone: "0712345678", pin: "0001" });
    const ok = await login({ phone: "0712345678", pin: "1357" });
    expect(ok.statusCode).toBe(200);
    // Counter cleared: a fresh wrong attempt is 401, not 429.
    const after = await login({ phone: "0712345678", pin: "0001" });
    expect(after.statusCode).toBe(401);
  });

  it("invalid phone format → 400, no audit", async () => {
    const res = await login({ phone: "123", pin: "1357" });
    expect(res.statusCode).toBe(400);
    expect(await dbh.db.select().from(auditOutbox)).toHaveLength(0);
  });
});
