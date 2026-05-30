import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database, type SmsTemplateRow } from "@bm/db";
import {
  validateSession,
  can,
  auditAction,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import {
  listActiveTemplates,
  listTemplateVersions,
  toPublicSmsTemplate,
  validateTemplateBody,
  saveTemplateVersion,
  extractPlaceholders,
} from "@bm/sms";
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
 * SMS templates admin API.
 *
 * Read (P1-E09-S03, AC3): list the active template per key and version history.
 * Write (P5-E03-S04 / Epic 33-4): edit a body and save a NEW VERSION. The save
 * validates placeholders against the body the editor previously rendered from
 * (the current active body's placeholders are the required set — AC2: a missing
 * `{name}` etc. is flagged), inserts a new active row at `version + 1`, and
 * retains all prior versions (AC3). All routes are gated on `manage config`
 * (admin / super_admin); the save is audited.
 *
 *   GET /admin/sms-templates                — active template per key (the view)
 *   GET /admin/sms-templates/:key/versions  — version history for one key
 *   PUT /admin/sms-templates/:key           — save a new version of the body
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

  // List the active template per key (the admin view, AC3).
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

  // Save a new version of a template body (Epic 33-4, AC2/AC3).
  app.put("/admin/sms-templates/:key", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { key } = req.params as { key: string };
    const body = req.body as { body?: unknown; language?: unknown } | null;
    if (!body || typeof body.body !== "string") {
      return reply.code(400).send({ error: "body must be a string", field: "body" });
    }
    const language = typeof body.language === "string" ? body.language : undefined;

    // The required placeholder set is whatever the current active body uses, so
    // an edit that DROPS a placeholder the template depends on is flagged (AC2).
    const versions = await listTemplateVersions(db, key, language);
    if (versions.length === 0) {
      return reply.code(404).send({ error: "Unknown template key", field: "key" });
    }
    const currentActive = versions.find((v) => v.isActive) ?? versions[0]!;
    const required = extractPlaceholders(currentActive.body);

    const validation = validateTemplateBody(body.body, required);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.issues[0], field: "body", issues: validation.issues });
    }

    const saved = await saveTemplateVersion(db, {
      key,
      body: body.body,
      language,
      updatedBy: actor.id,
    });
    await audit(db, {
      actor: actor.id,
      action: auditAction("sms.template.saved"),
      target: { table: "sms_templates", id: saved.id },
      payload: { key, language: saved.language, version: saved.version },
    });
    return reply.code(200).send(serialize(saved));
  });
}
