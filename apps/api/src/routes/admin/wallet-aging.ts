import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, CSRF_HEADER_NAME, auditAction } from "@bm/auth";
import { loadWalletAging } from "@bm/catalog";
import {
  walletAgingQuerySchema,
  walletAgingToCsv,
  walletAgingFilename,
  type WalletAgingReportDto,
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
 * Roles allowed to read / export the wallet-aging report (Story 27.4). Unlike the
 * 27.1 / 27.2 / 27.3 owner/treasury trio (which deliberately EXCLUDED accountant),
 * this is the ACCOUNTANT'S accounts-receivable aging view — the story is literally
 * "as accountant, I want to see how long outstanding balances have been open". So
 * `accountant` is included alongside the financial-reporting roles
 * (admin / super_admin / treasury) that own the books. Reception/parents are
 * excluded.
 */
const WALLET_AGING_ROLES = new Set<string>(["accountant", "admin", "super_admin", "treasury"]);

/** `YYYY-MM-DD` → the UTC start of that calendar day (the report `asOf`). */
function asOfDate(asOf: string | undefined): Date | undefined {
  return asOf ? new Date(`${asOf}T00:00:00.000Z`) : undefined;
}

/**
 * Wallet aging report (P3-E05-S04 / Story 27.4).
 *
 *   GET /admin/wallet-aging[?asOf]
 *     — outstanding balances bucketed by age (0–7 / 8–30 / 31–60 / 61–90 / 90+,
 *       AC1) with a per-parent row under each bucket carrying the profile-link key
 *       (AC2). Read-only, not audited (a read).
 *   GET /admin/wallet-aging/export[?asOf]
 *     — the SAME data, SAME optional `asOf` filter, streamed as `text/csv` with a
 *       Content-Disposition (AC3). A CSV export is an audited event in this
 *       codebase, so it emits `report.wallet_aging.export`.
 *
 * Both endpoints validate the optional `asOf`, re-check the role gate; the export
 * additionally audits.
 */
export function registerAdminWalletAging(app: FastifyInstance, deps: AdminDeps): void {
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
    if (!WALLET_AGING_ROLES.has(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  app.get("/admin/wallet-aging", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = walletAgingQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid asOf date", field: first?.path[0] });
    }

    const report = await loadWalletAging(db, { asOf: asOfDate(parsed.data.asOf) });
    const dto: WalletAgingReportDto = report;
    return reply.code(200).send(dto);
  });

  app.get("/admin/wallet-aging/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authorize(req, reply);
    if (!user) return reply;

    const parsed = walletAgingQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid asOf date", field: first?.path[0] });
    }

    const report = await loadWalletAging(db, { asOf: asOfDate(parsed.data.asOf) });
    const csv = walletAgingToCsv(report);
    // The filename embeds the as-of calendar date (the report instant's UTC day).
    const asOfDay = report.asOf.slice(0, 10);

    await audit(db, {
      actor: user.id,
      action: auditAction("report.wallet_aging.export"),
      target: { table: "invoices", id: null },
      payload: {
        as_of: asOfDay,
        total_cents: report.totalCents,
        ip: req.ip,
      },
    });

    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${walletAgingFilename({ asOf: asOfDay })}"`)
      .send(csv);
  });
}
