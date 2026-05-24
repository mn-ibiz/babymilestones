import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, LoginRateLimiter, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

/** Pull the token from a bm_session set-cookie header (array or string). */
const tokenFrom = (setCookie: string | string[]): string => {
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const c = arr.find((x) => x.startsWith("bm_session="))!;
  return c.match(/bm_session=([^;]+)/u)![1]!;
};
const csrfFrom = (setCookie: string | string[]): string => {
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const c = arr.find((x) => x.startsWith("bm_csrf="))!;
  return c.match(/bm_csrf=([^;]+)/u)![1]!;
};

describe("POST /auth/logout (P1-E01-S04 — global logout AC3/AC5)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions, rateLimiter: new LoginRateLimiter() });
    await dbh.db.insert(users).values({ phone: "+254712345678", pinHash: await hashPin("1357") });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const login = (): Promise<LightMyRequestResponse> =>
    app.inject({ method: "POST", url: "/auth/login", payload: { phone: "0712345678", pin: "1357" } });

  it("logout destroys the session token → SSO session gone everywhere (AC3)", async () => {
    const res = await login();
    const sc = res.headers["set-cookie"] as string[];
    const token = tokenFrom(sc);
    const csrf = csrfFrom(sc);
    expect(await sessions.get(token)).not.toBeNull();

    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `bm_session=${token}; bm_csrf=${csrf}`, "x-csrf-token": csrf },
    });
    expect(out.statusCode).toBe(200);
    // AC3: token destroyed in the shared store (prod Redis DEL).
    expect(await sessions.get(token)).toBeNull();
    // Cookies cleared on the shared domain.
    const cleared = out.headers["set-cookie"] as string[];
    expect(cleared.some((c) => /bm_session=;.*Max-Age=0/u.test(c))).toBe(true);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "auth.logout")).toBe(true);
  });

  it("logout-all destroys every session for the user", async () => {
    const a = tokenFrom((await login()).headers["set-cookie"] as string[]);
    const second = await login();
    const b = tokenFrom(second.headers["set-cookie"] as string[]);
    const csrf = csrfFrom(second.headers["set-cookie"] as string[]);
    expect(await sessions.get(a)).not.toBeNull();
    expect(await sessions.get(b)).not.toBeNull();

    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `bm_session=${b}; bm_csrf=${csrf}`, "x-csrf-token": csrf },
      payload: { all: true },
    });
    expect(out.statusCode).toBe(200);
    // Both sessions for that user are gone.
    expect(await sessions.get(a)).toBeNull();
    expect(await sessions.get(b)).toBeNull();
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "auth.logout.all")).toBe(true);
  });

  it("logout with a session cookie but no CSRF token → 403, session untouched (AC5)", async () => {
    const sc = (await login()).headers["set-cookie"] as string[];
    const token = tokenFrom(sc);
    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `bm_session=${token}` },
    });
    expect(out.statusCode).toBe(403);
    expect(await sessions.get(token)).not.toBeNull();
  });

  it("logout with no session cookie → 200 idempotent, cookies cleared", async () => {
    const out = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(out.statusCode).toBe(200);
    const cleared = out.headers["set-cookie"] as string[];
    expect(cleared.some((c) => /bm_session=;.*Max-Age=0/u.test(c))).toBe(true);
  });
});
