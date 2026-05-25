import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database, type SmsTemplateRow } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { listActiveTemplates, listTemplateVersions, toPublicSmsTemplate } from "@bm/sms";
import type { SessionStore } from "@bm/auth";

export interface AdminSmsTemplatesDeps {
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

/** Serialize a template row to the public API shape (ISO timestamps). */
function serialize(row: SmsTemplateRow) {
  const pub = toPublicSmsTemplate(row);
  return {
    id: pub.id,
    key: pub.key,
    language: pub.language,
    version: pub.version,
    body: pub.body,
    isActive: pub.isActive,
    createdAt: pub.createdAt.toISOString(),
    updatedAt: pub.updatedAt.toISOString(),
  };
}

/**
 * Registered SMS templates — read-only admin surface (P1-E09-S03, AC3). Editing
 * is deferred to P2; P1 only lists the registered, versioned copy so an operator
 * can see exactly what `send(...)` will render. Gated on `manage config`
 * (admin / super_admin), matching the SMS-config surface.
 *
 *   GET /admin/sms-templates            — active template per key (the view)
 *   GET /admin/sms-templates/:key/versions — version history for one key
 */
export function registerAdminSmsTemplates(app: FastifyInstance, deps: AdminSmsTemplatesDeps): void {
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

  // List the active template per key (the read-only admin view, AC3).
  app.get("/admin/sms-templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await listActiveTemplates(db);
    return reply.code(200).send({ templates: rows.map(serialize) });
  });

  // Version history for one key — shows versioning (AC1) in the UI.
  app.get(
    "/admin/sms-templates/:key/versions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { key } = req.params as { key: string };
      const rows = await listTemplateVersions(db, key);
      return reply.code(200).send({ key, versions: rows.map(serialize) });
    },
  );
}
