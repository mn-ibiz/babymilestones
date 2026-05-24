import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionStore } from "./session.js";
import {
  serializeSessionCookie,
  serializeCsrfCookie,
  generateCsrfToken,
  clearAuthCookies,
  parseCookies,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from "./session.js";
import { validateSession, guardRole, type ResolveUser } from "./middleware.js";

describe("cookie helpers (P1-E01-S04)", () => {
  it("session + csrf cookies pin to the shared domain; only session is HttpOnly", () => {
    const s = serializeSessionCookie("tok");
    expect(s).toMatch(/bm_session=tok/u);
    expect(s).toMatch(/Domain=\.babymilestones\.co\.ke/u);
    expect(s).toMatch(/HttpOnly/u);

    const c = serializeCsrfCookie("csrf");
    expect(c).toMatch(/bm_csrf=csrf/u);
    expect(c).toMatch(/Domain=\.babymilestones\.co\.ke/u);
    // CSRF cookie must be readable by JS for the double-submit echo.
    expect(c).not.toMatch(/HttpOnly/u);
  });

  it("clearAuthCookies expires both cookies on the shared domain", () => {
    const cleared = clearAuthCookies();
    expect(cleared).toHaveLength(2);
    expect(cleared.every((c) => /Max-Age=0/u.test(c))).toBe(true);
    expect(cleared.every((c) => /Domain=\.babymilestones\.co\.ke/u.test(c))).toBe(true);
  });

  it("parseCookies handles multiple, whitespace, and absent header", () => {
    expect(parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });
});

describe("validateSession guard (P1-E01-S04)", () => {
  let sessions: InMemorySessionStore;
  const USER = { id: "u-1", role: "parent" };
  const resolveUser: ResolveUser = async (userId) =>
    userId === USER.id ? USER : null;

  beforeEach(() => {
    sessions = new InMemorySessionStore();
  });

  const cookieFor = (token: string, csrf?: string): string => {
    const parts = [`${SESSION_COOKIE_NAME}=${token}`];
    if (csrf) parts.push(`${CSRF_COOKIE_NAME}=${csrf}`);
    return parts.join("; ");
  };

  it("no cookie → 401", async () => {
    const out = await validateSession(
      { method: "GET", cookieHeader: undefined, csrfHeader: null },
      { sessions, resolveUser },
    );
    expect(out).toEqual({ ok: false, status: 401, error: "Not authenticated" });
  });

  it("unknown token → 401", async () => {
    const out = await validateSession(
      { method: "GET", cookieHeader: cookieFor("bogus"), csrfHeader: null },
      { sessions, resolveUser },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(401);
  });

  it("valid session on a GET → attaches user (no CSRF needed)", async () => {
    const token = await sessions.create(USER.id);
    const out = await validateSession(
      { method: "GET", cookieHeader: cookieFor(token), csrfHeader: null },
      { sessions, resolveUser },
    );
    expect(out).toEqual({ ok: true, user: { id: "u-1", role: "parent" } });
  });

  it("valid session but resolveUser returns null (deleted/role-revoked) → 401", async () => {
    const token = await sessions.create("ghost");
    const out = await validateSession(
      { method: "GET", cookieHeader: cookieFor(token), csrfHeader: null },
      { sessions, resolveUser },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(401);
  });

  it("POST without CSRF token → 403 (AC5)", async () => {
    const token = await sessions.create(USER.id);
    const csrf = generateCsrfToken();
    const out = await validateSession(
      { method: "POST", cookieHeader: cookieFor(token, csrf), csrfHeader: null },
      { sessions, resolveUser },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(403);
  });

  it("POST with mismatched CSRF token → 403 (AC5)", async () => {
    const token = await sessions.create(USER.id);
    const out = await validateSession(
      { method: "POST", cookieHeader: cookieFor(token, "cookie-val"), csrfHeader: "header-val" },
      { sessions, resolveUser },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(403);
  });

  it("POST with matching double-submit CSRF token → ok (AC5)", async () => {
    const token = await sessions.create(USER.id);
    const csrf = generateCsrfToken();
    const out = await validateSession(
      { method: "POST", cookieHeader: cookieFor(token, csrf), csrfHeader: csrf },
      { sessions, resolveUser },
    );
    expect(out).toEqual({ ok: true, user: { id: "u-1", role: "parent" } });
  });
});

describe("guardRole (P1-E01-S04 AC4)", () => {
  it("allows a role on a surface that accepts it", () => {
    expect(guardRole({ id: "u", role: "admin" }, ["admin", "super_admin"])).toEqual({ ok: true });
  });

  it("parent on admin.* → 403 + redirect home (AC4)", () => {
    const res = guardRole({ id: "u", role: "parent" }, ["admin", "super_admin"]);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.redirect).toBe("/dashboard");
  });
});
