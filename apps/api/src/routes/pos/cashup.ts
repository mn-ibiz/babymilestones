import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  audit,
  floatAccounts,
  posCashups,
  posSales,
  reconciliationAdjustments,
  users,
  type Database,
  type Transaction,
} from "@bm/db";
import { validateSession, requirePermission, isStaffRole, CSRF_HEADER_NAME } from "@bm/auth";
import {
  cashupReasonRequired,
  posCashupRequestSchema,
  type PosCashupExpected,
  type PosCashupResponse,
} from "@bm/contracts";
import type { PosDeps } from "./index.js";

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

/** Shape grouped (method → summed cents) rows into the expected-takings DTO. */
function toExpected(byMethod: Map<string, number>): PosCashupExpected {
  return {
    expectedCashCents: byMethod.get("cash") ?? 0,
    expectedMpesaCents: byMethod.get("mpesa") ?? 0,
    expectedPaystackCents: byMethod.get("paystack") ?? 0,
  };
}

/**
 * PREVIEW the expected takings by method for a cashier (AC1) — the sum of their
 * paid POS sales not yet counted into a cash-up. Read-only (does not claim).
 * Wallet sales are excluded (they settle against a parent wallet, not a till
 * float). The authoritative figures are recomputed when the till is closed.
 */
async function previewExpected(db: Database, cashierId: string): Promise<PosCashupExpected> {
  const rows = await db
    .select({ method: posSales.method, total: sql<string>`COALESCE(SUM(${posSales.totalCents}), 0)` })
    .from(posSales)
    .where(and(eq(posSales.cashierUserId, cashierId), eq(posSales.status, "paid"), isNull(posSales.cashedUpAt)))
    .groupBy(posSales.method);
  return toExpected(new Map(rows.map((r) => [r.method, Number(r.total)])));
}

/**
 * CLAIM the cashier's uncashed paid sales into this cash-up: stamp `cashed_up_at`
 * atomically (`UPDATE … WHERE cashed_up_at IS NULL RETURNING`) so each sale is
 * counted in exactly one close — even under concurrent closes — and sum the
 * claimed rows by method. Runs in the caller's transaction.
 */
async function claimExpected(tx: Transaction, cashierId: string, now: Date): Promise<PosCashupExpected> {
  const claimed = await tx
    .update(posSales)
    .set({ cashedUpAt: now, updatedAt: now })
    .where(and(eq(posSales.cashierUserId, cashierId), eq(posSales.status, "paid"), isNull(posSales.cashedUpAt)))
    .returning({ method: posSales.method, total: posSales.totalCents });
  const byMethod = new Map<string, number>();
  for (const r of claimed) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.total);
  return toExpected(byMethod);
}

/**
 * End-of-day cash-up (P2-E04-S05).
 *
 * - GET  /pos/cashup/expected → expected cash / M-Pesa / Paystack since the
 *   cashier's last close (AC1). Read-only.
 * - POST /pos/cashup → record the counted cash, compute the variance (AC2),
 *   require a reason when it exceeds the threshold (AC3), persist the cash-up,
 *   post a pending reconciliation adjustment for any non-zero variance against
 *   the cash-drawer float (P1-E06), and audit (AC4).
 *
 * Guarded by `create payment` (cashier / reception — the till operators).
 */
export function registerPosCashup(app: FastifyInstance, deps: PosDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");

  async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    // Till-facing, staff-only — parents hold `create payment` and share the session
    // store, so gate on the staff role before exposing the cash-up endpoint.
    if (!isStaffRole(auth.user.role)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return auth.user.id;
  }

  const now = (): Date => (deps.now ? deps.now() : new Date());

  app.get("/pos/cashup/expected", async (req: FastifyRequest, reply: FastifyReply) => {
    const cashierId = await authorize(req, reply);
    if (!cashierId) return reply;
    return reply.code(200).send(await previewExpected(db, cashierId));
  });

  app.post("/pos/cashup", async (req: FastifyRequest, reply: FastifyReply) => {
    const cashierId = await authorize(req, reply);
    if (!cashierId) return reply;

    const parsed = posCashupRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid cash-up", field: first?.path.join(".") });
    }
    const { countedCashCents, reason } = parsed.data;
    const trimmedReason = reason && reason.trim() !== "" ? reason.trim() : null;

    // The active cash-drawer float a variance is reconciled against (P1-E06).
    // Ordered so the choice is deterministic when more than one is configured.
    const [cashFloat] = await db
      .select({ id: floatAccounts.id })
      .from(floatAccounts)
      .where(and(eq(floatAccounts.kind, "cash_drawer"), eq(floatAccounts.active, true)))
      .orderBy(asc(floatAccounts.createdAt))
      .limit(1);

    try {
      const result = await db.transaction(async (tx) => {
        // Atomically claim this cashier's uncashed paid sales → authoritative totals.
        const expected = await claimExpected(tx, cashierId, now());
        const varianceCents = countedCashCents - expected.expectedCashCents;

        // AC3: a large variance must be explained (re-checked against the claimed total).
        if (cashupReasonRequired(varianceCents) && !trimmedReason) {
          throw new CashupError(400, "A reason is required for a variance over KES 500", "reason");
        }
        // AC4: a variance must reach Treasury — never silently swallowed.
        if (varianceCents !== 0 && !cashFloat) {
          throw new CashupError(409, "No active cash-drawer float is configured; ask Treasury to set one up before closing with a variance");
        }

        let adjustmentId: string | null = null;
        if (varianceCents !== 0) {
          const [adj] = await tx
            .insert(reconciliationAdjustments)
            .values({
              floatAccountId: cashFloat!.id,
              amount: varianceCents,
              reason: trimmedReason ?? "POS end-of-day cash-up variance",
              postedBy: cashierId,
              status: "pending",
            })
            .returning({ id: reconciliationAdjustments.id });
          adjustmentId = adj!.id;
        }

        const [cashup] = await tx
          .insert(posCashups)
          .values({
            cashierUserId: cashierId,
            expectedCashCents: expected.expectedCashCents,
            expectedMpesaCents: expected.expectedMpesaCents,
            expectedPaystackCents: expected.expectedPaystackCents,
            countedCashCents,
            varianceCents,
            reason: trimmedReason,
            reconciliationAdjustmentId: adjustmentId,
          })
          .returning();

        await audit(tx, {
          actor: cashierId,
          action: "pos.cashup.closed",
          target: { table: "pos_cashups", id: cashup!.id },
          payload: {
            expected_cash_cents: expected.expectedCashCents,
            counted_cash_cents: countedCashCents,
            variance_cents: varianceCents,
            reconciliation_adjustment_id: adjustmentId,
          },
        });

        const response: PosCashupResponse = {
          id: cashup!.id,
          expectedCashCents: expected.expectedCashCents,
          expectedMpesaCents: expected.expectedMpesaCents,
          expectedPaystackCents: expected.expectedPaystackCents,
          countedCashCents,
          varianceCents,
          reason: trimmedReason,
          reconciliationAdjustmentId: adjustmentId,
        };
        return response;
      });
      return reply.code(201).send(result);
    } catch (e) {
      if (e instanceof CashupError) {
        return reply.code(e.status).send({ error: e.message, ...(e.field ? { field: e.field } : {}) });
      }
      throw e;
    }
  });
}

/** A cash-up validation failure that rolls back the claim transaction. */
class CashupError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "CashupError";
  }
}
