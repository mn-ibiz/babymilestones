import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import { loadCohortRetention } from "@bm/catalog";
import { cohortRetentionQuerySchema, type CohortRetentionDto } from "@bm/contracts";
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
 * Roles allowed to read the cohort-retention report (Story 35.2). The SAME explicit
 * allow-list as the rest of the operations-dashboard surfaces (27.1/27.2) — admin /
 * super_admin / treasury — deliberately narrower than the generic `read report`
 * posture (it excludes accountant). This is the owner/treasury growth-analytics view.
 */
const COHORT_ROLES = new Set<string>(["admin", "super_admin", "treasury"]);

/**
 * Cohort retention by signup month (Story 35.2).
 *
 *   GET /admin/cohort-retention?fromMonth&toMonth[&activeDefinition]
 *     — the retention matrix for the selected inclusive signup-month range (AC1):
 *       rows = signup month, columns = months-since-signup, each cell = % of the
 *       cohort with a paid touchpoint in that offset month. The "active" definition
 *       (AC2) defaults to wallet debits; `activeDefinition` overrides it.
 *
 * Read-only and gated to admin / super_admin / treasury. Not audited (a read — the
 * catalogue forbids `*.read`). The current partial month is never over-counted: the
 * read keys offsets to the current UTC month (or the injected clock) so a half-finished
 * month is omitted from the matrix.
 */
export function registerAdminCohortRetention(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const clock = deps.now ?? (() => new Date());

  app.get("/admin/cohort-retention", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    if (!COHORT_ROLES.has(auth.user.role)) {
      return reply.code(403).send({ error: "Forbidden: missing permission" });
    }

    const parsed = cohortRetentionQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid month range", field: first?.path[0] });
    }
    const { fromMonth, toMonth } = parsed.data;

    // Last fully-observable month = the current UTC month (or the injected clock), so
    // the in-progress month is omitted from the matrix (no over-counting). The
    // `activeDefinition` is reserved for future signals; the only definition today is
    // the default wallet-debit signal the read already applies.
    const asOfMonth = clock().toISOString().slice(0, 7);

    const matrix = await loadCohortRetention(db, { fromMonth, toMonth, asOfMonth });
    const dto: CohortRetentionDto = matrix;
    return reply.code(200).send(dto);
  });
}
