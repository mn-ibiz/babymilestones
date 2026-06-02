import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME, auditAction } from "@bm/auth";
import { loadPnlReport } from "@bm/catalog";
import {
  pnlReportQuerySchema,
  pnlReportToCsv,
  pnlReportToPrintableHtml,
  pnlReportCsvFilename,
  pnlReportPdfFilename,
  type PnlComparisonDto,
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
 * Roles allowed to read / export the consolidated P&L (Story 35.1). The P&L is the
 * SENSITIVE owners'-books view — revenue, costs, expenses and net per unit — so it
 * gates to the financial-reporting roles that own the books: `accountant` (the
 * books owner, same as the wallet-aging report) alongside admin / super_admin /
 * treasury. Reception / cashier / parents are excluded. The server is the
 * authority — the admin nav mirrors this but is never trusted.
 */
const PNL_ROLES = new Set<string>(["accountant", "admin", "super_admin", "treasury"]);

/**
 * Consolidated P&L by period (P6-E05-S01 / Story 35.1).
 *
 *   GET /admin/pnl-report?anchor&granularity
 *     — per-unit revenue / direct costs / expenses / net + consolidated totals
 *       (AC1) for the anchor's calendar month/year, with the prior-period
 *       comparison (AC2). Read-only, not audited (a read).
 *   GET /admin/pnl-report/export.csv?anchor&granularity
 *     — the SAME report as `text/csv` (the "Excel" export — the repo's CSV
 *       convention; spreadsheets open it natively) with a Content-Disposition.
 *   GET /admin/pnl-report/export.pdf?anchor&granularity
 *     — the SAME report as a printable A4 `text/html` document the browser prints
 *       to PDF (Decision 13 — no native PDF dependency).
 *
 * Both exports are audited events (`report.pnl.export`). Every endpoint re-checks
 * the role gate + re-validates the query.
 */
export function registerAdminPnlReport(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!PNL_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  function parseQuery(req: FastifyRequest, reply: FastifyReply) {
    const parsed = pnlReportQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
      return null;
    }
    return parsed.data;
  }

  app.get("/admin/pnl-report", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const query = parseQuery(req, reply);
    if (!query) return reply;

    const comparison = await loadPnlReport(db, { anchor: query.anchor, granularity: query.granularity });
    const dto: PnlComparisonDto = { granularity: query.granularity, ...comparison };
    return reply.code(200).send(dto);
  });

  /** Shared export handler for both formats — loads, audits, streams. */
  async function exportHandler(
    req: FastifyRequest,
    reply: FastifyReply,
    format: "csv" | "pdf",
  ) {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const query = parseQuery(req, reply);
    if (!query) return reply;

    const comparison = await loadPnlReport(db, { anchor: query.anchor, granularity: query.granularity });
    const dto: PnlComparisonDto = { granularity: query.granularity, ...comparison };

    await audit(db, {
      actor: user.id,
      action: auditAction("report.pnl.export"),
      target: { table: "expenses", id: null },
      payload: {
        anchor: query.anchor,
        granularity: query.granularity,
        format,
        from: dto.current.from,
        to: dto.current.to,
        net_cents: dto.current.totals.netCents,
        ip: req.ip,
      },
    });

    if (format === "csv") {
      return reply
        .code(200)
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${pnlReportCsvFilename(dto)}"`)
        .send(pnlReportToCsv(dto));
    }
    return reply
      .code(200)
      .header("content-type", "text/html; charset=utf-8")
      .header("content-disposition", `attachment; filename="${pnlReportPdfFilename(dto)}"`)
      .send(pnlReportToPrintableHtml(dto));
  }

  app.get("/admin/pnl-report/export.csv", (req, reply) => exportHandler(req, reply, "csv"));
  app.get("/admin/pnl-report/export.pdf", (req, reply) => exportHandler(req, reply, "pdf"));
}
