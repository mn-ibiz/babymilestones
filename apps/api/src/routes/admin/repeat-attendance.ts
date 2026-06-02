import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadRepeatAttendance } from "@bm/catalog";
import { repeatAttendanceQuerySchema, type RepeatAttendanceDto } from "@bm/contracts";
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
 * Roles allowed to read the repeat-attendance report (Story 35.3). The SAME explicit
 * allow-list as the rest of the operations-dashboard surface (27.1/27.2/27.5, 35.2) —
 * admin / super_admin / treasury — deliberately narrower than the generic
 * `read report` posture (it excludes accountant). This is the owner/treasury
 * growth-analytics view.
 */
const REPEAT_ATTENDANCE_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Repeat-attendance metrics for events and classes (P6-E06-S03 / Story 35.3).
 *
 *   GET /admin/repeat-attendance?fromDate&toDate
 *     — a per-class table over the inclusive date range (AC1/AC2): total attendees,
 *       % who attended ANOTHER class (repeat rate), and average classes attended per
 *       attendee, plus an overall summary. A "class" is an event (door-checked-in
 *       ticket) or a class-type booking (`talent`/`coaching` with an attendance
 *       check-in); a parent who attended ≥2 distinct classes in the window is a
 *       "repeat" in every one. Out-of-order / malformed ranges 400.
 *
 * Read-only — NOT audited (a read). Re-checks the role gate + re-validates the range
 * on every request; the client is never trusted.
 */
export function registerAdminRepeatAttendance(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  app.get("/admin/repeat-attendance", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    if (!REPEAT_ATTENDANCE_ROLES.has(auth.user.role)) {
      return reply.code(403).send({ error: "Forbidden: missing permission" });
    }

    const parsed = repeatAttendanceQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid request", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;

    const report = await loadRepeatAttendance(db, { from: fromDate, to: toDate });
    const dto: RepeatAttendanceDto = report;
    return reply.code(200).send(dto);
  });
}
