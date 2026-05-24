import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audit } from "@bm/db";
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  clearAuthCookies,
  parseCookies,
} from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface LogoutBody {
  /** When true, destroy every session for the user (logout everywhere). */
  all?: boolean;
}

/**
 * POST /auth/logout — global logout (P1-E01-S04, AC3).
 *
 * Destroys the session token in the shared store (the prod Redis `DEL`) so the
 * session disappears on every subdomain that reads the same `bm_session`
 * cookie, and clears the session + CSRF cookies on `.babymilestones.co.ke`.
 * `{ all: true }` destroys every session for the user (logout-all) via
 * `destroyAllForUser`. Idempotent: no cookie / unknown token still returns 200
 * with cleared cookies. CSRF is enforced on this mutating verb.
 */
export function registerLogout(app: FastifyInstance, { db, sessions }: AuthDeps): void {
  app.post("/auth/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const cookies = parseCookies(req.headers.cookie ?? null);
    const token = cookies[SESSION_COOKIE_NAME];
    const body = (req.body ?? {}) as LogoutBody;

    // AC5: logout is state-changing, so enforce the double-submit CSRF token
    // whenever a live session cookie is present.
    if (token) {
      const csrfCookie = cookies[CSRF_COOKIE_NAME];
      const csrfHeader = req.headers[CSRF_HEADER_NAME];
      const headerVal = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
      if (!csrfCookie || !headerVal || csrfCookie !== headerVal) {
        return reply.code(403).send({ error: "CSRF token missing or invalid" });
      }
    }

    if (token) {
      const session = await sessions.get(token);
      if (session) {
        if (body.all === true) {
          await sessions.destroyAllForUser(session.userId);
        } else {
          await sessions.destroy(token);
        }
        await audit(db, {
          actor: session.userId,
          action: body.all === true ? "auth.logout.all" : "auth.logout",
          target: { table: "users", id: session.userId },
          payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
        });
      }
    }

    // Always clear cookies — idempotent even when there was no live session.
    reply.header("set-cookie", clearAuthCookies());
    return reply.code(200).send({ ok: true });
  });
}
