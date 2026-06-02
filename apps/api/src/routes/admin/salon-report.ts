import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import {
  validateSession,
  can,
  CSRF_HEADER_NAME,
  type Action,
  type Resource,
  type PermissionPrincipal,
} from "@bm/auth";
import { aggregateSalonDayReport, listSalonReportingRowsForDate } from "@bm/catalog";
import type { SalonDayReportDto } from "@bm/contracts";
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Salon-specific reporting tile + drill-down (P3-E03-S05 / Story 25.5).
 *
 *   GET /admin/salon-report?date=YYYY-MM-DD
 *     — today's (or `date`'s) salon bookings / no-shows / revenue (AC1) plus a
 *       per-stylist breakdown (AC2).
 *
 * Read-only and gated on `read report` — the same admin-reporting roles (admin,
 * accountant, treasury, super_admin) that gate commission-run reads. Not audited
 * (a read). The data + tile + drill-down are forward-compatible with the
 * operational dashboard (P3-E05 / Epic 27): Epic 27 reuses this endpoint to drop
 * the tile into the dashboard grid.
 */
export function registerAdminSalonReport(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const clock = deps.now ?? (() => new Date());

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
    action: Action,
    resource: Resource,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, action, resource)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/salon-report", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorize(req, reply, "read", "report"))) return reply;
    const now = clock();
    const q = req.query as { date?: string };
    const date = q.date && ISO_DATE_RE.test(q.date) ? q.date : now.toISOString().slice(0, 10);

    const rows = await listSalonReportingRowsForDate(db, { date });
    const report = aggregateSalonDayReport(rows, { date, now });
    const dto: SalonDayReportDto = report;
    return reply.code(200).send(dto);
  });
}
