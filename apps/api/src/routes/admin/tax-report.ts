import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME, auditAction } from "@bm/auth";
import { loadTaxReport } from "@bm/catalog";
import {
  taxReportQuerySchema,
  taxReportToCsv,
  taxReportToPrintableHtml,
  taxReportCsvFilename,
  taxReportPdfFilename,
  type TaxReportDto,
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
 * Roles allowed to read / export the tax-ready summary (Story 35.6). The tax report
 * is the FINANCE / accountant view — per-period taxable supplies, VAT charged and
 * exempt supplies for a VAT return — so it gates to the financial-reporting roles
 * that own the books: `accountant` (the books owner) alongside admin / super_admin /
 * treasury. Reception / cashier / parents are excluded. The server is the
 * authority — the admin nav mirrors this but is never trusted.
 */
const TAX_REPORT_ROLES = new Set<string>(["accountant", "admin", "super_admin", "treasury"]);

/**
 * Tax-ready exports by period (P6-E07-S06 / Story 35.6).
 *
 *   GET /admin/tax-report?fromDate&toDate
 *     — per-period TAXABLE SUPPLIES, VAT CHARGED, EXEMPT SUPPLIES (+ total + a
 *       per-month breakdown) for settled, non-voided receipts (AC1). Read-only,
 *       not audited (a read).
 *   GET /admin/tax-report/export.csv?fromDate&toDate
 *     — the SAME report as `text/csv` (the "Excel" export — the repo's CSV
 *       convention; spreadsheets open it natively) with a Content-Disposition.
 *   GET /admin/tax-report/export.pdf?fromDate&toDate
 *     — the SAME report as a printable A4 `text/html` document the browser prints
 *       to PDF (Decision 13 — no native PDF dependency).
 *
 * Both exports are audited events (`report.tax.export`). Every endpoint re-checks
 * the role gate + re-validates the query.
 */
export function registerAdminTaxReport(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!TAX_REPORT_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  function parseQuery(req: FastifyRequest, reply: FastifyReply) {
    const parsed = taxReportQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
      return null;
    }
    return parsed.data;
  }

  app.get("/admin/tax-report", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const query = parseQuery(req, reply);
    if (!query) return reply;

    const report = await loadTaxReport(db, { fromDate: query.fromDate, toDate: query.toDate });
    const dto: TaxReportDto = {
      fromDate: query.fromDate,
      toDate: query.toDate,
      taxableSuppliesCents: report.taxableSuppliesCents,
      vatChargedCents: report.vatChargedCents,
      exemptSuppliesCents: report.exemptSuppliesCents,
      totalSuppliesCents: report.totalSuppliesCents,
      byMonth: report.byMonth,
    };
    return reply.code(200).send(dto);
  });

  /** Shared export handler for both formats — loads, audits, streams. */
  async function exportHandler(req: FastifyRequest, reply: FastifyReply, format: "csv" | "pdf") {
    const user = await authorize(req, reply);
    if (!user) return reply;
    const query = parseQuery(req, reply);
    if (!query) return reply;

    const report = await loadTaxReport(db, { fromDate: query.fromDate, toDate: query.toDate });
    const dto: TaxReportDto = {
      fromDate: query.fromDate,
      toDate: query.toDate,
      taxableSuppliesCents: report.taxableSuppliesCents,
      vatChargedCents: report.vatChargedCents,
      exemptSuppliesCents: report.exemptSuppliesCents,
      totalSuppliesCents: report.totalSuppliesCents,
      byMonth: report.byMonth,
    };

    await audit(db, {
      actor: user.id,
      action: auditAction("report.tax.export"),
      target: { table: "receipts", id: null },
      payload: {
        fromDate: query.fromDate,
        toDate: query.toDate,
        format,
        taxable_supplies_cents: dto.taxableSuppliesCents,
        vat_charged_cents: dto.vatChargedCents,
        exempt_supplies_cents: dto.exemptSuppliesCents,
        ip: req.ip,
      },
    });

    if (format === "csv") {
      return reply
        .code(200)
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${taxReportCsvFilename(dto)}"`)
        .send(taxReportToCsv(dto));
    }
    return reply
      .code(200)
      .header("content-type", "text/html; charset=utf-8")
      .header("content-disposition", `attachment; filename="${taxReportPdfFilename(dto)}"`)
      .send(taxReportToPrintableHtml(dto));
  }

  app.get("/admin/tax-report/export.csv", (req, reply) => exportHandler(req, reply, "csv"));
  app.get("/admin/tax-report/export.pdf", (req, reply) => exportHandler(req, reply, "pdf"));
}
