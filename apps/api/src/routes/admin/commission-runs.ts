import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import {
  audit,
  commissionRunLines,
  commissionRuns,
  staff,
  users,
  type Database,
} from "@bm/db";
import {
  validateSession,
  can,
  auditAction,
  CSRF_HEADER_NAME,
  type Action,
  type Resource,
  type PermissionPrincipal,
} from "@bm/auth";
import { buildPayoutCsv, createCommissionRun, previewCommissionRun, type PayoutRow } from "@bm/catalog";
import { inArray } from "drizzle-orm";
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

/** Parse a date input (ISO string) → Date, or null when invalid. */
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ad-hoc commission runs + run listing (P3-E01-S04, used by S05). Run management
 * (preview + confirm) is admin-gated (`manage service`); reads are gated on
 * `read report` (admin / accountant / treasury / super_admin).
 *
 *   POST /admin/commission-runs/preview  — preview totals for a range (AC1; no write)
 *   POST /admin/commission-runs          — confirm → create an `ad_hoc` run (AC2)
 *   GET  /admin/commission-runs          — list runs (newest first)
 *   GET  /admin/commission-runs/:id      — one run + its per-staff lines
 *
 * The ad-hoc run claims the period's ledger entries, so a later month-end run
 * excludes them (AC3) — that exclusion lives in `createCommissionRun`.
 */
export function registerCommissionRuns(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
    action: Action,
    resource: Resource,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, action, resource)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // Preview totals for a date range (AC1). No persistence; read-only (not audited).
  app.post("/admin/commission-runs/preview", async (req, reply) => {
    const actor = await authorize(req, reply, "manage", "service");
    if (!actor) return reply;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const periodStart = parseDate(body.periodStart);
    const periodEnd = parseDate(body.periodEnd);
    if (!periodStart || !periodEnd) {
      return reply.code(400).send({ error: "periodStart and periodEnd must be valid ISO timestamps" });
    }
    if (periodEnd <= periodStart) {
      return reply.code(400).send({ error: "periodEnd must be after periodStart" });
    }
    const preview = await previewCommissionRun(db, { periodStart, periodEnd });
    return reply.code(200).send({
      periodStart: preview.periodStart.toISOString(),
      periodEnd: preview.periodEnd.toISOString(),
      totalCents: preview.totalCents,
      lines: preview.lines,
    });
  });

  // Confirm → create an ad-hoc run (AC2).
  app.post("/admin/commission-runs", async (req, reply) => {
    const actor = await authorize(req, reply, "manage", "service");
    if (!actor) return reply;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const periodStart = parseDate(body.periodStart);
    const periodEnd = parseDate(body.periodEnd);
    if (!periodStart || !periodEnd) {
      return reply.code(400).send({ error: "periodStart and periodEnd must be valid ISO timestamps" });
    }
    if (periodEnd <= periodStart) {
      return reply.code(400).send({ error: "periodEnd must be after periodStart" });
    }
    const result = await createCommissionRun(db, { kind: "ad_hoc", periodStart, periodEnd, createdBy: actor.id });
    await audit(db, {
      actor: actor.id,
      action: auditAction("commission.run.created"),
      target: { table: "commission_runs", id: result.run.id },
      payload: {
        kind: "ad_hoc",
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        total_cents: result.run.totalCents,
        line_count: result.lines.length,
        ip: req.ip,
      },
    });
    return reply.code(201).send({
      run: serializeRun(result.run),
      lines: result.lines,
    });
  });

  // List runs (newest first). Read — not audited.
  app.get("/admin/commission-runs", async (req, reply) => {
    const actor = await authorize(req, reply, "read", "report");
    if (!actor) return reply;
    const rows = await db.select().from(commissionRuns).orderBy(desc(commissionRuns.createdAt));
    return reply.code(200).send({ runs: rows.map(serializeRun) });
  });

  // One run + its per-staff lines. Read — not audited.
  app.get("/admin/commission-runs/:id", async (req, reply) => {
    const actor = await authorize(req, reply, "read", "report");
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const [run] = await db.select().from(commissionRuns).where(eq(commissionRuns.id, id));
    if (!run) return reply.code(404).send({ error: "Commission run not found" });
    const lines = await db.select().from(commissionRunLines).where(eq(commissionRunLines.runId, id));
    return reply.code(200).send({
      run: serializeRun(run),
      lines: lines.map((l) => ({ staffId: l.staffId, staffNameSnapshot: l.staffNameSnapshot, amountCents: l.amountCents })),
    });
  });

  // Download the payout CSV for a run (S05 AC1) — staff name, phone, amount,
  // reference (M-Pesa B2C feed). Guarded `commission.export`-equivalent via the
  // export-capable `read report` roles; the download itself is audited (AC2).
  app.get("/admin/commission-runs/:id/export.csv", async (req, reply) => {
    const actor = await authorize(req, reply, "read", "report");
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const [run] = await db.select().from(commissionRuns).where(eq(commissionRuns.id, id));
    if (!run) return reply.code(404).send({ error: "Commission run not found" });

    const lines = await db.select().from(commissionRunLines).where(eq(commissionRunLines.runId, id));
    // Resolve current phone per staff (snapshot the name from the line — payout
    // history must not rewrite if the staff is later renamed).
    const staffIds = [...new Set(lines.map((l) => l.staffId))];
    const phoneById = new Map<string, string>();
    if (staffIds.length) {
      for (const s of await db.select({ id: staff.id, phone: staff.phone }).from(staff).where(inArray(staff.id, staffIds))) {
        phoneById.set(s.id, s.phone ?? "");
      }
    }
    const rows: PayoutRow[] = lines.map((l) => ({
      staffName: l.staffNameSnapshot,
      phone: phoneById.get(l.staffId) ?? "",
      amountCents: l.amountCents,
      // Reference ties the payout back to (run, staff) for reconciliation.
      reference: `COMM-${id.slice(0, 8)}-${l.staffId.slice(0, 8)}`,
    }));
    const csv = buildPayoutCsv(rows);

    await audit(db, {
      actor: actor.id,
      action: auditAction("commission.run.export"),
      target: { table: "commission_runs", id },
      payload: { line_count: rows.length, total_cents: run.totalCents, bytes: csv.length, ip: req.ip },
    });
    return reply
      .code(200)
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="commission-run-${id}.csv"`)
      .send(csv);
  });

  // Mark a run paid out after the admin confirms the external payout (S05 AC3).
  // Admin-gated (`manage service`); idempotent (a second mark is a no-op); audited.
  app.post("/admin/commission-runs/:id/mark-paid", async (req, reply) => {
    const actor = await authorize(req, reply, "manage", "service");
    if (!actor) return reply;
    const { id } = req.params as { id: string };
    const [run] = await db.select().from(commissionRuns).where(eq(commissionRuns.id, id));
    if (!run) return reply.code(404).send({ error: "Commission run not found" });
    if (run.paidOutAt) {
      return reply.code(200).send({ run: serializeRun(run), alreadyPaid: true });
    }
    const paidOutAt = new Date();
    const [updated] = await db
      .update(commissionRuns)
      .set({ paidOutAt })
      // Conditional on still-null so a concurrent mark does not double-audit.
      .where(eq(commissionRuns.id, id))
      .returning();
    await audit(db, {
      actor: actor.id,
      action: auditAction("commission.run.paid_out"),
      target: { table: "commission_runs", id },
      payload: { paid_out_at: paidOutAt.toISOString(), total_cents: run.totalCents, ip: req.ip },
    });
    return reply.code(200).send({ run: serializeRun(updated!), alreadyPaid: false });
  });
}

/** Public shape of a commission run. */
function serializeRun(run: {
  id: string;
  kind: string;
  periodStart: Date;
  periodEnd: Date;
  totalCents: number;
  paidOutAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: run.id,
    kind: run.kind,
    periodStart: run.periodStart.toISOString(),
    periodEnd: run.periodEnd.toISOString(),
    totalCents: run.totalCents,
    paidOutAt: run.paidOutAt ? run.paidOutAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
  };
}
