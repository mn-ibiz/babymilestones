import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME, auditAction } from "@bm/auth";
import { loadFeedbackDashboard, loadFeedbackResponses } from "@bm/catalog";
import {
  feedbackDashboardQuerySchema,
  feedbackResponsesQuerySchema,
  type FeedbackDashboardDto,
  type FeedbackResponseDto,
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
 * Roles allowed to READ the feedback dashboard + the ANONYMISED individual
 * responses (Story 34.2). The report-reading posture — admin / super_admin /
 * treasury / accountant — matching the salon-report `read report` gate. A read,
 * not audited.
 */
const FEEDBACK_READ_ROLES = new Set<string>(["admin", "super_admin", "treasury", "accountant"]);

/**
 * Roles allowed to DE-ANONYMISE (reveal the parent behind a rating, Story 34.2
 * AC3). Deliberately the STRONGEST report roles only — admin / super_admin. A
 * reveal is a sensitive identity disclosure: treasury/accountant can read the
 * anonymised surface but may NOT unmask a parent. The reveal writes an audit row.
 */
const FEEDBACK_REVEAL_ROLES = new Set<string>(["admin", "super_admin"]);

/**
 * Feedback dashboard by unit + by staff (P6-E04-S02 / Story 34.2).
 *
 *   GET /admin/feedback-dashboard?fromDate&toDate
 *     — per-unit + per-staff aggregates over the inclusive range (AC1/AC2). The
 *       staff averages carry a min-sample guardrail (suppressed below threshold).
 *   GET /admin/feedback-dashboard/responses?fromDate&toDate[&unit][&staffId][&reveal]
 *     — the individual responses for a unit/staff (AC3). ANONYMISED by default —
 *       NO parent identity. `reveal=true` returns the parent identity, is gated to
 *       admin / super_admin only, and writes a `feedback.deanonymised` audit row.
 *
 * Read-only except for the de-anonymise audit. The dashboard READ itself is not
 * audited (the catalogue forbids `*.read`).
 */
export function registerAdminFeedbackDashboard(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!FEEDBACK_READ_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/feedback-dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = feedbackDashboardQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid date range", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;

    const dashboard = await loadFeedbackDashboard(db, { from: fromDate, to: toDate });
    const dto: FeedbackDashboardDto = dashboard;
    return reply.code(200).send(dto);
  });

  app.get("/admin/feedback-dashboard/responses", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = feedbackResponsesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }
    const { fromDate, toDate, unit, staffId, reveal } = parsed.data;

    // De-anonymising is a strong, separately-gated action (AC3). A read-only role
    // (treasury/accountant) may see the anonymised surface but never unmask.
    if (reveal && !FEEDBACK_REVEAL_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "Forbidden: de-anonymising feedback requires admin" });
    }

    const responses = await loadFeedbackResponses(db, {
      from: fromDate,
      to: toDate,
      unit: unit as FeedbackResponseDto["unit"] | undefined,
      staffId,
      reveal,
    });

    // The reveal is the one audited event on this surface: an admin unmasked the
    // parents behind these ratings (AC3). The comment TEXT is never put in the
    // payload — only the scope (window, filters) + the count revealed.
    if (reveal) {
      await audit(db, {
        actor: user.id,
        action: auditAction("feedback.deanonymised"),
        target: { table: "feedback", id: null },
        payload: {
          from_date: fromDate,
          to_date: toDate,
          unit: unit ?? null,
          staff_id: staffId ?? null,
          revealed_count: responses.length,
          ip: req.ip,
        },
      });
    }

    const dto: { responses: FeedbackResponseDto[] } = {
      responses: responses.map((r) => ({
        id: r.id,
        unit: r.unit,
        staffId: r.staffId,
        staffName: r.staffName,
        rating: r.rating,
        comment: r.comment,
        submittedAt: r.submittedAt.toISOString(),
        ...(r.parentId !== undefined ? { parentId: r.parentId } : {}),
        ...(r.parentName !== undefined ? { parentName: r.parentName } : {}),
      })),
    };
    return reply.code(200).send(dto);
  });
}
