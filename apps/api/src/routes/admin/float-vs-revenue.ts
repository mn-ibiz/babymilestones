import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadFloatVsRevenue } from "@bm/catalog";
import { floatVsRevenueQuerySchema, type FloatVsRevenueDto } from "@bm/contracts";
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
 * Roles allowed to read the wallet-float-vs-revenue report (Story 35.4). This is a
 * treasury/finance report — "as accountant, I want a daily report on how much
 * customer money is sitting in wallets vs revenue earned" — so the gate is the
 * financial-reporting set: accountant (the story's actor) plus the roles that own
 * the books (admin / super_admin / treasury). The SAME set as the wallet-aging
 * report (27.4). Reception/parents are excluded; the client is never trusted.
 */
const FLOAT_VS_REVENUE_ROLES = new Set<string>([
  "accountant",
  "admin",
  "super_admin",
  "treasury",
]);

/** Today's UTC calendar day (`YYYY-MM-DD`) — the snapshot day when `asOf` is absent. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Wallet float vs revenue snapshot (P5-E05-S04 / Story 35.4).
 *
 *   GET /admin/float-vs-revenue[?asOf&days]
 *     — the daily snapshot for `asOf` (defaults to today): the total
 *       customer-wallet liability (Σ wallet_ledger ≤ day), the segregated
 *       float/bank balance, the prior-day liability delta, and revenue earned that
 *       day (AC1) — plus the trailing `days`-day (90 by default) float-vs-revenue
 *       series for the chart (AC2). Read-only, not audited (a read). No export, so
 *       no audit action.
 *
 * Every figure is reconstructed on-the-fly from the append-only wallet ledger +
 * the static float-account opening balances + the Epic 27 daily-revenue source
 * (no snapshot table). Re-validates the optional `asOf` + `days` and re-checks the
 * role gate.
 */
export function registerAdminFloatVsRevenue(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!FLOAT_VS_REVENUE_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/float-vs-revenue", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = floatVsRevenueQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }

    const to = parsed.data.asOf ?? todayUtc();
    const report = await loadFloatVsRevenue(db, { to, days: parsed.data.days });
    const dto: FloatVsRevenueDto = report;
    return reply.code(200).send(dto);
  });
}
