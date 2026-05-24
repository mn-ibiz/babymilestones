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
