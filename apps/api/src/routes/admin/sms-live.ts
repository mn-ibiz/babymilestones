import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, getSetting, setSetting, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { SMS_LIVE_ENABLED_KEY } from "@bm/sms";
import type { SessionStore } from "@bm/auth";

export interface AdminSmsLiveDeps {
  db: Database;
  sessions: SessionStore;
}

/** Resolve a session userId to its live id+role (for the permission guard). */
function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/**
 * SMS live/stub switch admin API (P5-E03-S02). Reads and flips the
 * `sms.live_enabled` flag in the generic settings store. OFF (the default) keeps
 * the stub adapter behind the `SmsSender` seam; ON (with wired transport+key at
 * the composition root) selects the live adapter via `resolveSmsSender`.
 *
 *   GET /admin/sms-live   — read the current flag.
 *   PUT /admin/sms-live   — flip the flag; audited with before/after (AC3).
 *
 * Reserved to roles holding `manage config` (admin / super_admin). Going live is
 * a consequential action, so every flip is audited (`sms.live.toggled`).
 */
export function registerAdminSmsLive(app: FastifyInstance, deps: AdminSmsLiveDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, "manage", "config")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // Read the current flag (default OFF).
  app.get("/admin/sms-live", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const value = await getSetting(db, SMS_LIVE_ENABLED_KEY);
    return reply.code(200).send({ enabled: value === true });
  });

  // Flip the flag (AC1) — audited with before/after (AC3).
  app.put("/admin/sms-live", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const body = req.body as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled must be a boolean", field: "enabled" });
    }
    const before = (await getSetting(db, SMS_LIVE_ENABLED_KEY)) === true;
    await setSetting(db, SMS_LIVE_ENABLED_KEY, body.enabled);
    await audit(db, {
      actor: actor.id,
      action: "sms.live.toggled",
      target: { table: "settings", id: SMS_LIVE_ENABLED_KEY },
      payload: { before: { enabled: before }, after: { enabled: body.enabled }, ip: req.ip },
    });
    return reply.code(200).send({ enabled: body.enabled });
  });
}
