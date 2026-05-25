import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import {
  audit,
  reconciliationAdjustments,
  users,
  type Database,
  type ReconciliationAdjustmentRow,
} from "@bm/db";
import { floatLiabilities } from "@bm/wallet";
import {
  validateSession,
  can,
  canViewReconciliation,
  canApproveAdjustment as canApproveAdjustmentCap,
  CSRF_HEADER_NAME,
  type PermissionPrincipal,
} from "@bm/auth";
import {
  adjustingEntryCreateSchema,
  computeDrift,
  isDrifting,
  hasReconciliationDrift,
  type ReconciliationResponse,
  type ReconciliationRow,
  type ReconciliationAdjustment,
} from "@bm/contracts";
import type { SessionStore } from "@bm/auth";

export interface ReconciliationDeps {
  db: Database;
  sessions: SessionStore;
  /** Clock injection for the `asOf` day (deterministic tests). Defaults to now. */
  now?: () => number;
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** Resolve a session userId to its live id+role (for the permission guard). */
function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

/**
 * Reconciliation screen access (P1-E06-S03 AC3): admin, treasury, super_admin.
 * Deliberately broader than the approval capability — admin may view + post but
 * not approve. Accountant retains its `read reconciliation` grant for exports.
 */
function canReadReconciliation(p: PermissionPrincipal): boolean {
  return canViewReconciliation(p.role) || can(p.role, "read", "reconciliation");
}
/** Posting an adjusting entry: admin (`manage wallet`) or treasury (`manage reconciliation`). */
function canPostAdjustment(p: PermissionPrincipal): boolean {
  return can(p.role, "manage", "wallet") || can(p.role, "manage", "reconciliation");
}
/**
 * Approving an adjustment is reserved to holders of the named capability
 * `treasury.approve_adjustment` — treasury + super_admin only (P1-E06-S03 AC2/AC3).
 */
function canApproveAdjustment(p: PermissionPrincipal): boolean {
  return canApproveAdjustmentCap(p.role);
}

function serializeAdjustment(row: ReconciliationAdjustmentRow): ReconciliationAdjustment {
  return {
    id: row.id,
    floatAccountId: row.floatAccountId,
    amount: row.amount,
    reason: row.reason,
    postedBy: row.postedBy,
    approvedBy: row.approvedBy,
    status: row.status as ReconciliationAdjustment["status"],
    reversesAdjustmentId: row.reversesAdjustmentId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** YYYY-MM-DD for a given epoch ms (UTC). */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Daily reconciliation (P1-E06-S02).
 *
 *   GET   /treasury/reconciliation
 *     Per float account: system-tracked balance (float liability from the
 *     ledger), the manually-entered real-world balance (query: ?real[id]=cents),
 *     and the drift = system − real. Sets `hasDrift` when any account drifts
 *     beyond KES 100 (AC1, AC2). Read: treasury/accountant.
 *
 *   POST  /treasury/reconciliation/adjustments
 *     Post an adjusting entry (admin/treasury). status=pending, audited (AC3, AC4).
 *
 *   POST  /treasury/reconciliation/adjustments/:id/approve
 *     Approve a pending adjustment (treasury only, distinct approver). Audited.
 *
 *   POST  /treasury/reconciliation/adjustments/:id/reject
 *     Reject a pending adjustment (treasury only). Audited.
 */
export function registerReconciliationRoutes(app: FastifyInstance, deps: ReconciliationDeps): void {
  const { db, sessions } = deps;
  const now = deps.now ?? Date.now;
  const resolveUser = makeResolveUser(db);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
    grant: (p: PermissionPrincipal) => boolean,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!grant(auth.user)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // AC1/AC2: read model. Real-world balances are passed by the client as a map
  // (manual input today, API in P5 — AC1); the server computes drift centrally
  // so the > KES 100 banner threshold lives in exactly one place (AC2).
  app.get("/treasury/reconciliation", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply, canReadReconciliation);
    if (!actor) return reply;

    // Manual real-world balances arrive as flat query keys `real[<accountId>]`
    // (Fastify's default querystring parser does not nest brackets, so we read
    // them off the flat key namespace). Value is integer cents.
    const query = (req.query ?? {}) as Record<string, string>;
    const realInput: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      const m = key.match(/^real\[(.+)\]$/u);
      if (m && m[1]) realInput[m[1]] = value;
    }

    const liabilities = await floatLiabilities(db);
    const rows: ReconciliationRow[] = liabilities.map((l) => {
      const raw = realInput[l.floatAccountId];
      const realCents = raw === undefined || raw === "" ? null : Number(raw);
      const validReal = realCents !== null && Number.isFinite(realCents) ? realCents : null;
      const driftCents = validReal === null ? null : computeDrift(l.systemCents, validReal);
      return {
        floatAccountId: l.floatAccountId,
        name: l.name,
        kind: l.kind,
        systemCents: l.systemCents,
        realCents: validReal,
        driftCents,
        isDrifting: driftCents === null ? false : isDrifting(driftCents),
      };
    });

    const body: ReconciliationResponse = {
      asOf: isoDay(now()),
      rows,
      hasDrift: hasReconciliationDrift(
        rows.map((r) => r.driftCents).filter((d): d is number => d !== null),
      ),
    };
    return reply.code(200).send(body);
  });

  // AC3/AC4: post an adjusting entry — pending, audited.
  app.post(
    "/treasury/reconciliation/adjustments",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply, canPostAdjustment);
      if (!actor) return reply;

      const parsed = adjustingEntryCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply
          .code(400)
          .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const { floatAccountId, amount, reason } = parsed.data;

      const [row] = await db
        .insert(reconciliationAdjustments)
        .values({ floatAccountId, amount, reason, postedBy: actor.id, status: "pending" })
        .returning();

      await audit(db, {
        actor: actor.id,
        action: "treasury.reconciliation.adjustment.post",
        target: { table: "reconciliation_adjustments", id: row!.id },
        payload: { float_account_id: floatAccountId, amount, reason, ip: req.ip },
      });

      return reply.code(201).send(serializeAdjustment(row!));
    },
  );

  // AC3: approve — treasury only, distinct approver (no self-approval), audited.
  app.post(
    "/treasury/reconciliation/adjustments/:id/approve",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply, canApproveAdjustment);
      if (!actor) return reply;
      const { id } = req.params as { id: string };

      const [existing] = await db
        .select()
        .from(reconciliationAdjustments)
        .where(eq(reconciliationAdjustments.id, id));
      if (!existing) return reply.code(404).send({ error: "Adjustment not found" });
      if (existing.status !== "pending") {
        return reply.code(409).send({ error: `Adjustment is already ${existing.status}` });
      }
      // Dual-approval (AC3): the approver must differ from the poster.
      if (existing.postedBy === actor.id) {
        return reply.code(403).send({ error: "An adjustment must be approved by a second person" });
      }

      const [row] = await db
        .update(reconciliationAdjustments)
        .set({ status: "approved", approvedBy: actor.id, updatedAt: new Date() })
        .where(eq(reconciliationAdjustments.id, id))
        .returning();

      await audit(db, {
        actor: actor.id,
        action: "treasury.reconciliation.adjustment.approve",
        target: { table: "reconciliation_adjustments", id },
        payload: { posted_by: existing.postedBy, amount: existing.amount, ip: req.ip },
      });

      return reply.code(200).send(serializeAdjustment(row!));
    },
  );

  // AC3: reject — treasury only, audited. Terminal; posts nothing.
  app.post(
    "/treasury/reconciliation/adjustments/:id/reject",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply, canApproveAdjustment);
      if (!actor) return reply;
      const { id } = req.params as { id: string };

      const [existing] = await db
        .select()
        .from(reconciliationAdjustments)
        .where(eq(reconciliationAdjustments.id, id));
      if (!existing) return reply.code(404).send({ error: "Adjustment not found" });
      if (existing.status !== "pending") {
        return reply.code(409).send({ error: `Adjustment is already ${existing.status}` });
      }

      const [row] = await db
        .update(reconciliationAdjustments)
        .set({ status: "rejected", approvedBy: actor.id, updatedAt: new Date() })
        .where(eq(reconciliationAdjustments.id, id))
        .returning();

      await audit(db, {
        actor: actor.id,
        action: "treasury.reconciliation.adjustment.reject",
        target: { table: "reconciliation_adjustments", id },
        payload: { posted_by: existing.postedBy, ip: req.ip },
      });

      return reply.code(200).send(serializeAdjustment(row!));
    },
  );

  // List adjustments for a float account, newest-first (drives the screen).
  app.get(
    "/treasury/reconciliation/adjustments",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply, canReadReconciliation);
      if (!actor) return reply;
      const { floatAccountId } = (req.query ?? {}) as { floatAccountId?: string };
      const base = db.select().from(reconciliationAdjustments);
      const rows = floatAccountId
        ? await base
            .where(eq(reconciliationAdjustments.floatAccountId, floatAccountId))
            .orderBy(desc(reconciliationAdjustments.createdAt))
        : await base.orderBy(desc(reconciliationAdjustments.createdAt));
      return reply.code(200).send({ adjustments: rows.map(serializeAdjustment) });
    },
  );
}
