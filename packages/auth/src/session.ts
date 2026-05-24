import { randomBytes } from "node:crypto";

export interface SessionData {
  userId: string;
  createdAt: number;
}

/**
 * Opaque-token session store. Prod uses Redis (wired in P1-E01-S04 SSO);
 * the in-memory implementation backs tests and local dev.
 */
export interface SessionStore {
  create(userId: string): Promise<string>;
  get(token: string): Promise<SessionData | null>;
  destroy(token: string): Promise<void>;
  destroyAllForUser(userId: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { userId, createdAt: Date.now() });
    return token;
  }

  async get(token: string): Promise<SessionData | null> {
    return this.sessions.get(token) ?? null;
  }

  async destroy(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async destroyAllForUser(userId: string): Promise<void> {
    for (const [token, data] of this.sessions) {
      if (data.userId === userId) this.sessions.delete(token);
    }
  }
}

export const SESSION_COOKIE_NAME = "bm_session";
/**
 * CSRF double-submit token cookie (P1-E01-S04). Readable by JS (NOT HttpOnly)
 * so the client can echo it into the X-CSRF-Token header on mutating requests.
 */
export const CSRF_COOKIE_NAME = "bm_csrf";
/** Header the client echoes the CSRF cookie value into (double-submit). */
export const CSRF_HEADER_NAME = "x-csrf-token";
const COOKIE_DOMAIN = ".babymilestones.co.ke";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Serialise the session cookie: HttpOnly, Secure, SameSite=Lax (AC / spec). */
export function serializeSessionCookie(token: string, maxAge = MAX_AGE_SECONDS): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Domain=${COOKIE_DOMAIN}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/**
 * Serialise the CSRF cookie. Same domain/expiry as the session, but NOT
 * HttpOnly: the double-submit pattern needs the client to read it and echo it
 * back in the request header.
 */
export function serializeCsrfCookie(token: string, maxAge = MAX_AGE_SECONDS): string {
  return [
    `${CSRF_COOKIE_NAME}=${token}`,
    `Domain=${COOKIE_DOMAIN}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/** A fresh, unguessable CSRF token (opaque, like the session token). */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Clear the session + CSRF cookies (logout). Expires both on the shared domain. */
export function clearAuthCookies(): string[] {
  const expire = (name: string, extra: string[]): string =>
    [`${name}=`, `Domain=${COOKIE_DOMAIN}`, "Path=/", "Max-Age=0", ...extra].join("; ");
  return [
    expire(SESSION_COOKIE_NAME, ["HttpOnly", "Secure", "SameSite=Lax"]),
    expire(CSRF_COOKIE_NAME, ["Secure", "SameSite=Lax"]),
  ];
}

/** Parse a raw `Cookie` header into a name→value map. Safe on undefined/empty. */
export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}
