import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadRevenueByPeriod } from "@bm/catalog";
import {
  revenueByPeriodQuerySchema,
  revenueByPeriodToCsv,
  revenueByPeriodFilename,
  type RevenueByPeriodDto,
} from "@bm/contracts";
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
 * Roles allowed to read / export the revenue-by-period report (Story 27.2). The
 * SAME explicit allow-list as the 27.1 operations dashboard — admin / super_admin
 * / treasury — deliberately narrower than the generic `read report` posture (it
 * excludes accountant). This is the owner/treasury revenue-trends view.
 */
const REVENUE_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Revenue by unit, by period (P3-E05-S02 / Story 27.2).
 *
 *   GET /admin/revenue-by-period?fromDate&toDate
 *     — per-unit NET revenue series + period-over-period delta (AC1). Read-only,
 *       not audited (a read).
 *   GET /admin/revenue-by-period/export?fromDate&toDate
 *     — the SAME data, SAME date-range filter, streamed as `text/csv` with a
 *       Content-Disposition (AC2). A CSV export is an audited event in this
 *       codebase, so it emits `report.revenue.export`.
 *
 * NET revenue excludes refunded amounts (AC3) — the catalogue read subtracts
 * in-period refunds per unit. Both endpoints re-validate the range and re-check
 * the role gate; the export additionally audits.
 */
export function registerAdminRevenueByPeriod(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!REVENUE_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/revenue-by-period", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = revenueByPeriodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid date range", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;

    const report = await loadRevenueByPeriod(db, { from: fromDate, to: toDate });
    const dto: RevenueByPeriodDto = report;
    return reply.code(200).send(dto);
  });

  app.get("/admin/revenue-by-period/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = revenueByPeriodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid date range", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;

    const report = await loadRevenueByPeriod(db, { from: fromDate, to: toDate });
    const csv = revenueByPeriodToCsv(report);

    await audit(db, {
      actor: user.id,
      action: "report.revenue.export",
      target: { table: "bookings", id: null },
      payload: {
        from_date: fromDate,
        to_date: toDate,
        total_cents: report.totalCents,
        ip: req.ip,
      },
    });

    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${revenueByPeriodFilename({ fromDate, toDate })}"`)
      .send(csv);
  });
}
