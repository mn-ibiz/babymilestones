import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type AdminAlertRow, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME, auditAction } from "@bm/auth";
import { dismissAdminAlert, listUnreadAdminAlerts } from "@bm/catalog";
import type { AdminAlertDto } from "@bm/contracts";
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
 * Roles allowed to READ + act on the in-app admin alerts (Story 34.3). The same
 * report-reading posture as the feedback dashboard the alerts link to — admin /
 * super_admin / treasury / accountant. A negative-feedback alert is operational
 * context for the report-reading audience.
 */
const ALERTS_ROLES = new Set<string>(["admin", "super_admin", "treasury", "accountant"]);

/** Project a stored alert row to the wire DTO. Never carries sensitive free text. */
function toDto(row: AdminAlertRow): AdminAlertDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity as AdminAlertDto["severity"],
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    body: row.body,
    linkPath: row.linkPath,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Admin in-app alerts API (P6-E04-S03 / Story 34.3) — the bell / alerts list.
 *
 *   GET  /admin/alerts             → the unread alerts (newest-first), each
 *                                    linking to the feedback detail (AC1/AC2).
 *   POST /admin/alerts/:id/dismiss → dismiss an alert (drops it off the list);
 *                                    audited `alert.dismissed`.
 *
 * Gated to the report-reading roles. The list READ is not audited (a read); a
 * dismiss is a state change and writes a forensic line.
 */
export function registerAdminAlerts(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  async function authorize(req: FastifyRequest, reply: FastifyReply) {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!ALERTS_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/alerts", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const rows = await listUnreadAdminAlerts(db);
    const alerts = rows.map(toDto);
    return reply.code(200).send({ alerts, count: alerts.length });
  });

  app.post("/admin/alerts/:id/dismiss", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const { id } = req.params as { id: string };
    const dismissed = await dismissAdminAlert(db, id);
    // Unknown id, or already dismissed → nothing to do.
    if (!dismissed) {
      return reply.code(404).send({ error: "Alert not found or already dismissed" });
    }

    await audit(db, {
      actor: user.id,
      action: auditAction("alert.dismissed"),
      target: { table: "admin_alerts", id: dismissed.id },
      payload: { type: dismissed.type, source_type: dismissed.sourceType, source_id: dismissed.sourceId, ip: req.ip },
    });

    return reply.code(200).send({ id: dismissed.id, dismissed: true });
  });
}
