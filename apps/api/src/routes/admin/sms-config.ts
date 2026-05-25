import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database, type SmsConfigRow } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { smsConfigCreateSchema, smsConfigUpdateSchema } from "@bm/contracts";
import {
  checkProviderUrlSafety,
  createSmsConfig,
  deleteSmsConfig,
  getSmsConfig,
  listSmsConfigs,
  toPublicSmsConfig,
  updateSmsConfig,
} from "@bm/sms";
import type { SessionStore } from "@bm/auth";

export interface AdminSmsConfigDeps {
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

/** Serialize to the public, secret-free shape (AC2). ISO timestamps for the API. */
function serialize(row: SmsConfigRow) {
  const pub = toPublicSmsConfig(row);
  return {
    id: pub.id,
    senderId: pub.senderId,
    apiUrl: pub.apiUrl,
    apiKeyRef: pub.apiKeyRef,
    isActive: pub.isActive,
    createdAt: pub.createdAt.toISOString(),
    updatedAt: pub.updatedAt.toISOString(),
  };
}

/**
 * SMS provider config administration (P1-E09-S02). All routes are reserved to
 * roles holding `manage config` (admin / super_admin).
 *
 *   GET    /admin/sms-config        — list (newest first)
 *   POST   /admin/sms-config        — create (AC1); optionally activate (AC4)
 *   GET    /admin/sms-config/:id    — read one
 *   PATCH  /admin/sms-config/:id    — update / toggle active (AC1/AC4)
 *   DELETE /admin/sms-config/:id    — remove
 *
 * The API key value is NEVER accepted or returned — only `api_key_ref`, the
 * env-var NAME holding the key (AC1/AC2). `api_url` must be HTTPS and must not
 * resolve to a private / loopback / link-local / metadata host (AC3), enforced
 * here via `@bm/sms` `checkProviderUrlSafety`. Every mutation is audited (DoD).
 */
export function registerAdminSmsConfig(app: FastifyInstance, deps: AdminSmsConfigDeps): void {
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

  // List.
  app.get("/admin/sms-config", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await listSmsConfigs(db);
    return reply.code(200).send({ configs: rows.map(serialize) });
  });

  // Create (AC1) — optionally activate (AC4).
  app.post("/admin/sms-config", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = smsConfigCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const safety = checkProviderUrlSafety(parsed.data.apiUrl);
    if (!safety.ok) {
      return reply.code(400).send({ error: safety.message ?? "Invalid API URL", field: "apiUrl" });
    }
    const row = await createSmsConfig(db, parsed.data);
    await audit(db, {
      actor: actor.id,
      action: "sms.config.create",
      target: { table: "sms_config", id: row.id },
      // Audit the ref + url only — NEVER a secret value (AC2).
      payload: {
        sender_id: row.senderId,
        api_url: row.apiUrl,
        api_key_ref: row.apiKeyRef,
        is_active: row.isActive,
        ip: req.ip,
      },
    });
    return reply.code(201).send(serialize(row));
  });

  // Read one.
  app.get("/admin/sms-config/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const row = await getSmsConfig(db, id);
    if (!row) return reply.code(404).send({ error: "SMS config not found" });
    return reply.code(200).send(serialize(row));
  });

  // Update / toggle active (AC1/AC4).
  app.patch("/admin/sms-config/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = smsConfigUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    if (parsed.data.apiUrl !== undefined) {
      const safety = checkProviderUrlSafety(parsed.data.apiUrl);
      if (!safety.ok) {
        return reply.code(400).send({ error: safety.message ?? "Invalid API URL", field: "apiUrl" });
      }
    }
    const { id } = req.params as { id: string };
    const row = await updateSmsConfig(db, id, parsed.data);
    if (!row) return reply.code(404).send({ error: "SMS config not found" });
    await audit(db, {
      actor: actor.id,
      action: "sms.config.update",
      target: { table: "sms_config", id },
      payload: { changes: parsed.data, ip: req.ip },
    });
    return reply.code(200).send(serialize(row));
  });

  // Delete.
  app.delete("/admin/sms-config/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const removed = await deleteSmsConfig(db, id);
    if (!removed) return reply.code(404).send({ error: "SMS config not found" });
    await audit(db, {
      actor: actor.id,
      action: "sms.config.delete",
      target: { table: "sms_config", id },
      payload: { ip: req.ip },
    });
    return reply.code(204).send();
  });
}
