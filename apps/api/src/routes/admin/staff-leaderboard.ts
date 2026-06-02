import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadStaffLeaderboard, loadStaffCommissionDrilldown } from "@bm/catalog";
import {
  staffLeaderboardQuerySchema,
  revenueByPeriodQuerySchema,
  type StaffLeaderboardDto,
  type StaffCommissionDrilldownDto,
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
 * Roles allowed to read the top-staff leaderboard (Story 27.3). The SAME explicit
 * allow-list as the 27.1 operations dashboard + 27.2 revenue-by-period — admin /
 * super_admin / treasury — deliberately narrower than the generic `read report`
 * posture (it excludes accountant). This is the owner/treasury performance view.
 */
const LEADERBOARD_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Top-staff leaderboard (P3-E05-S03 / Story 27.3).
 *
 *   GET /admin/staff-leaderboard?fromDate&toDate&role
 *     — per-staff total revenue, count of services, and average ticket over the
 *       selected period (AC1), ranked by revenue. Optionally filtered to a single
 *       attribution role (AC2). Read-only, not audited.
 *   GET /admin/staff-leaderboard/:staffId/commission?fromDate&toDate
 *     — one staff member's commission totals for the SAME period (AC3), netting
 *       the commission ledger (the single source of truth). 404 for an unknown id.
 *
 * Both endpoints re-validate the range, re-check the role gate, and are read-only
 * (the catalogue forbids `*.read` audit actions). The drill-down reuses the same
 * date-range schema as revenue-by-period (no role on the drill-down).
 */
export function registerAdminStaffLeaderboard(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!LEADERBOARD_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/staff-leaderboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = staffLeaderboardQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }
    const { fromDate, toDate, role } = parsed.data;

    const report = await loadStaffLeaderboard(db, { from: fromDate, to: toDate, role });
    const dto: StaffLeaderboardDto = report;
    return reply.code(200).send(dto);
  });

  app.get<{ Params: { staffId: string } }>(
    "/admin/staff-leaderboard/:staffId/commission",
    async (req, reply) => {
      const user = await authorize(req, reply);
      if (!user) return reply;

      const parsed = revenueByPeriodQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.code(400).send({ error: first?.message ?? "Invalid date range", field: first?.path[0] });
      }
      const { fromDate, toDate } = parsed.data;

      const drill = await loadStaffCommissionDrilldown(db, {
        staffId: req.params.staffId,
        from: fromDate,
        to: toDate,
      });
      if (!drill) return reply.code(404).send({ error: "Staff member not found" });

      const dto: StaffCommissionDrilldownDto = drill;
      return reply.code(200).send(dto);
    },
  );
}
