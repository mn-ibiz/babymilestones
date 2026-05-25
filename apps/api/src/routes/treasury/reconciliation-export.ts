import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { reconciliationExportRows } from "@bm/wallet";
import {
  validateSession,
  can,
  canViewReconciliation,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
  type SessionStore,
} from "@bm/auth";
import { reconciliationExportQuerySchema, reconciliationRowsToCsv } from "@bm/contracts";

export interface ReconciliationExportDeps {
  db: Database;
  sessions: SessionStore;
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

/**
 * Who may export the reconciliation (P1-E06-S04): the reconciliation viewers
 * (admin/treasury/super_admin) plus the accountant, whose `read reconciliation`
 * grant exists precisely so they can pull this CSV. Same rule the live screen
 * uses (P1-E06-S02), so view and export never diverge.
 */
function canExportReconciliation(p: PermissionPrincipal): boolean {
  return canViewReconciliation(p.role) || can(p.role, "read", "reconciliation");
}

/**
 * GET /treasury/reconciliation/export?fromDate&toDate (P1-E06-S04).
 *
 * Streams the per-day-per-float-account reconciliation as `text/csv` for the
 * accountant: date, account, system balance, real balance, drift, and the
 * adjustments made that day — amounts as KES decimals (AC1/AC2). Access is
 * guarded to treasury/accountant (admin/super_admin too); the export is audited.
 */
export function registerReconciliationExportRoute(
  app: FastifyInstance,
  deps: ReconciliationExportDeps,
): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  app.get("/treasury/reconciliation/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    if (!canExportReconciliation(auth.user)) {
      return reply.code(403).send({ error: "Forbidden: missing permission" });
    }

    const parsed = reconciliationExportQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid date range", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;

    const rows = await reconciliationExportRows(db, { fromDate, toDate });
    const csv = reconciliationRowsToCsv(rows);

    await audit(db, {
      actor: auth.user.id,
      action: "treasury.reconciliation.export",
      target: { table: "float_accounts", id: null },
      payload: { from_date: fromDate, to_date: toDate, row_count: rows.length, ip: req.ip },
    });

    const filename = `reconciliation_${fromDate}_to_${toDate}.csv`;
    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });
}
