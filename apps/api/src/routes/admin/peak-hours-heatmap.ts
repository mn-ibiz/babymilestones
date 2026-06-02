import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadPeakHoursHeatmap } from "@bm/catalog";
import { peakHoursHeatmapQuerySchema, type PeakHoursHeatmapDto } from "@bm/contracts";
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
 * Roles allowed to read the peak-hours heatmap (Story 27.5). The SAME explicit
 * allow-list as 27.1 / 27.2 — admin / super_admin / treasury — deliberately
 * narrower than the generic `read report` posture (it excludes accountant). This is
 * the owner/treasury operations-reporting trio.
 */
const HEATMAP_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Peak-hours heatmap (P3-E05-S05 / Story 27.5).
 *
 *   GET /admin/peak-hours-heatmap?fromDate&toDate&unit
 *     — a 7×24 weekday×hour grid of active-session counts over the range (AC1),
 *       optionally filtered to a single unit (AC2). The range is capped at 12
 *       months (AC3) by the query schema; out-of-order / too-long / unknown-unit
 *       requests 400. Read-only — NOT audited (a read).
 *
 * A "session" is an attendance check-in; its weekday × hour are derived in UTC
 * (consistent with the rest of reporting). Re-checks the role gate + re-validates
 * the range/unit on every request; the client is never trusted.
 */
export function registerAdminPeakHoursHeatmap(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!HEATMAP_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/peak-hours-heatmap", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = peakHoursHeatmapQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid request", field: first?.path[0] });
    }
    const { fromDate, toDate, unit } = parsed.data;

    const report = await loadPeakHoursHeatmap(db, { from: fromDate, to: toDate, unit });
    const dto: PeakHoursHeatmapDto = { ...report, unit: unit ?? null };
    return reply.code(200).send(dto);
  });
}
