import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { auditOutbox, users, type AuditOutboxRow, type Database } from "@bm/db";
import {
  requirePermission,
  validateSession,
  type PermissionPrincipal,
  type SessionStore,
} from "@bm/auth";
import {
  auditLogQuerySchema,
  auditLogEventsToCsv,
  type AuditLogEvent,
  type AuditLogQuery,
} from "@bm/contracts";

export interface AdminAuditDeps {
  db: Database;
  sessions: SessionStore;
}

// Reading the audit log requires the `read audit` grant (admin / super_admin).
const guard = requirePermission("read", "audit");

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

/** Read-only projection of an outbox row for the viewer (never leaks payload). */
function serialize(row: AuditOutboxRow): AuditLogEvent {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    targetTable: row.targetTable,
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Build the AND-composed filter list from the validated query (AC1). */
function buildFilters(q: AuditLogQuery) {
  const clauses = [];
  if (q.actor !== undefined) clauses.push(eq(auditOutbox.actorUserId, q.actor));
  if (q.action !== undefined) clauses.push(eq(auditOutbox.action, q.action));
  if (q.targetId !== undefined) clauses.push(eq(auditOutbox.targetId, q.targetId));
  // Date range is inclusive of whole calendar days (UTC): [fromDate 00:00,
  // toDate+1day 00:00).
  if (q.fromDate !== undefined) {
    clauses.push(gte(auditOutbox.createdAt, new Date(`${q.fromDate}T00:00:00.000Z`)));
  }
  if (q.toDate !== undefined) {
    const next = new Date(`${q.toDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    clauses.push(lt(auditOutbox.createdAt, next));
  }
  return clauses.length > 0 ? and(...clauses) : undefined;
}

/**
 * Read-only audit log viewer (P1-E10-S03).
 *
 *   GET /admin/audit          — paginated, filterable list (AC1/AC2)
 *   GET /admin/audit/export   — same filters, streamed as text/csv (AC2)
 *
 * Reads from `audit_outbox` — the durable outbox written in-transaction with
 * each business write (X5-S01). The async `audit_log` projection (X5-S02 / 13-2)
 * is not landed yet; once it ships, point `SOURCE` below at that table (same
 * column shape). This surface is read-only BY CONSTRUCTION (AC3): it registers
 * only GET handlers — no create/update/delete route touches the audit log.
 */
export function registerAdminAudit(app: FastifyInstance, deps: AdminAuditDeps): void {
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
        // GET is a safe method; validateSession does not require CSRF for it.
        csrfHeader: null,
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const decision = guard({ id: auth.user.id, role: auth.user.role });
    if (!decision.ok) {
      reply.code(decision.status).send({ error: decision.error });
      return null;
    }
    return { id: auth.user.id, role: auth.user.role };
  }

  function parseQuery(req: FastifyRequest, reply: FastifyReply): AuditLogQuery | null {
    const parsed = auditLogQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      reply.code(400).send({ error: first?.message ?? "Invalid filter", field: first?.path[0] });
      return null;
    }
    return parsed.data;
  }

  // Paginated, filterable list (newest-first). Returns events + the total
  // matching count so the UI can render pagination controls (AC2).
  app.get("/admin/audit", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const q = parseQuery(req, reply);
    if (!q) return reply;

    const where = buildFilters(q);
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditOutbox)
      .where(where);

    const rows = await db
      .select()
      .from(auditOutbox)
      .where(where)
      .orderBy(desc(auditOutbox.createdAt), desc(auditOutbox.id))
      .limit(q.limit)
      .offset(q.offset);

    return reply.code(200).send({ events: rows.map(serialize), total: Number(count) });
  });

  // CSV export of the (filtered) audit log (AC2). Unpaginated — the same filters
  // apply, capped defensively so an export can never run away.
  app.get("/admin/audit/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const q = parseQuery(req, reply);
    if (!q) return reply;

    const rows = await db
      .select()
      .from(auditOutbox)
      .where(buildFilters(q))
      .orderBy(desc(auditOutbox.createdAt), desc(auditOutbox.id));

    const csv = auditLogEventsToCsv(rows.map(serialize));
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="audit_log_${stamp}.csv"`)
      .send(csv);
  });
}
