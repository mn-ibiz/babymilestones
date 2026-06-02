import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadOperationsDashboard } from "@bm/catalog";
import type { OperationsDashboardDto } from "@bm/contracts";
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
 * Roles allowed to read the daily-operations dashboard (Story 27.1 AC4). EXACTLY
 * `admin` / `super_admin` / `treasury` — deliberately narrower than the generic
 * `read report` posture (which also grants `accountant`). The dashboard is a
 * read-only owner/treasury operations view, so the gate is an explicit allow-list
 * rather than the coarse `read report` matrix grant.
 */
const DASHBOARD_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Daily operations dashboard (P3-E05-S01 / Story 27.1).
 *
 *   GET /admin/operations-dashboard
 *     — today's tile data (AC1): revenue (total + per-unit), bookings count,
 *       active sessions, outstanding balances total, and top staff today.
 *
 * Read-only and gated to admin / super_admin / treasury (AC4). Not audited (a
 * read — the catalogue forbids `*.read`). The client polls every 60s (AC3);
 * there is no server cache here because every aggregate is a fresh count off the
 * day's bookings + open invoices (the same on-demand pattern the salon-report
 * tile uses). The numbers click through to existing drill-down surfaces (AC2),
 * wired client-side via the `@bm/contracts` tile view-model.
 */
export function registerAdminOperationsDashboard(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const clock = deps.now ?? (() => new Date());

  app.get("/admin/operations-dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    if (!DASHBOARD_ROLES.has(auth.user.role)) {
      return reply.code(403).send({ error: "Forbidden: missing permission" });
    }

    const date = clock().toISOString().slice(0, 10);
    const dashboard = await loadOperationsDashboard(db, { date });
    const dto: OperationsDashboardDto = dashboard;
    return reply.code(200).send(dto);
  });
}
