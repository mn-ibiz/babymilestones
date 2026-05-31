import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import {
  validateSession,
  can,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import { backupRetentionPolicySchema } from "@bm/contracts";
import {
  getEffectiveBackupRetentionPolicy,
  saveBackupRetentionPolicy,
} from "../../lib/backup-retention.js";
import type { AdminDeps } from "./index.js";

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
 * Backup retention policy admin API (P2-E06-S01). The retention policy is a
 * configuration concern, so it lives behind the same `manage config` permission
 * as the rest of the Settings sub-app (admin / super_admin):
 *
 *   GET /admin/backup-retention  → the effective policy (stored or defaults)
 *   PUT /admin/backup-retention  → validate + persist a new policy, audited
 *
 * The policy is one JSON row in `settings` under `backup.retention`. Every write
 * is audited to `audit_outbox` (`backup.retention.updated`) and stamps
 * `updated_by` with the acting admin. Unlocks Decision 35 (configurable vs the
 * fixed P1 30-day window).
 */
export function registerAdminBackupRetention(
  app: FastifyInstance,
  deps: AdminDeps,
): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  /** Authenticate + enforce `manage config`. Returns the principal or sends an error. */
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

  app.get("/admin/backup-retention", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const policy = await getEffectiveBackupRetentionPolicy(db);
    return reply.code(200).send(policy);
  });

  app.put("/admin/backup-retention", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = backupRetentionPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await saveBackupRetentionPolicy(db, parsed.data, actor.id);
    await audit(db, {
      actor: actor.id,
      action: "backup.retention.updated",
      target: { table: "settings", id: "backup.retention" },
      payload: { ...parsed.data, ip: req.ip },
    });

    return reply.code(200).send(parsed.data);
  });
}
