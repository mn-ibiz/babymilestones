import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadDailyDispatch } from "@bm/catalog";
import {
  dailyDispatchQuerySchema,
  resolveDispatchDate,
  dailyDispatchToCsv,
  dailyDispatchFilename,
  type DailyDispatchReportDto,
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
 * Roles allowed to read / export the daily dispatch report (Story 29.4). The SAME
 * explicit allow-list as the 27.x owner reporting surfaces — admin / super_admin /
 * treasury — deliberately narrower than the generic `read report` posture.
 */
const DISPATCH_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Daily dispatch report (P4-E04-S04 / Story 29.4).
 *
 *   GET /admin/daily-dispatch?date
 *     — status counts + total value + pack/dispatch averages + the sync-health
 *       (dead-letter) count for the day (AC2/AC5). `date` defaults to today (AC4).
 *       Read-only, not audited (a read).
 *   GET /admin/daily-dispatch/export?date
 *     — the SAME data, SAME date filter, streamed as `text/csv` with a
 *       Content-Disposition (AC3). A CSV export is an audited event in this
 *       codebase, so it emits `report.dispatch.export`.
 *
 * Reads ONLY the WooCommerce-originated `wc_orders` set (AC1) + `order_events` +
 * `wc_outbox_dead`; no live Woo call, and in-store POS sales are never included.
 */
export function registerAdminDailyDispatch(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!DISPATCH_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/daily-dispatch", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = dailyDispatchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid date", field: first?.path[0] });
    }
    const date = resolveDispatchDate(parsed.data.date);

    const report = await loadDailyDispatch(db, { date });
    const dto: DailyDispatchReportDto = report;
    return reply.code(200).send(dto);
  });

  app.get("/admin/daily-dispatch/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = dailyDispatchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid date", field: first?.path[0] });
    }
    const date = resolveDispatchDate(parsed.data.date);

    const report = await loadDailyDispatch(db, { date });
    const csv = dailyDispatchToCsv(report);

    await audit(db, {
      actor: user.id,
      action: "report.dispatch.export",
      target: { table: "wc_orders", id: null },
      payload: {
        date,
        total_orders: report.totalOrders,
        total_value_cents: report.totalValueCents,
        sync_health_count: report.syncHealthCount,
        ip: req.ip,
      },
    });

    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${dailyDispatchFilename({ date })}"`)
      .send(csv);
  });
}
