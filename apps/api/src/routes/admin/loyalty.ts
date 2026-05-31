import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import {
  CSRF_HEADER_NAME,
  requirePermission,
  validateSession,
  type PermissionPrincipal,
  type SessionStore,
} from "@bm/auth";
import { loyaltyAdjustSchema } from "@bm/contracts";
import { adjustLoyaltyPoints, loyaltyBalance, LoyaltyAdjustmentError } from "@bm/wallet";

export interface AdminLoyaltyDeps {
  db: Database;
  sessions: SessionStore;
}

// Admin Reception → parent → loyalty → "Adjust" (AC1). Reserved to roles holding
// `manage loyalty` (admin / super_admin); enforced server-side (AC4).
const guard = requirePermission("manage", "loyalty");

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
 * Admin manual loyalty adjustment (P3-E04-S03). Credits or debits a parent's
 * loyalty-points balance for goodwill or correction:
 *
 *   POST /admin/parents/:parentId/loyalty/adjust   { points, reason }
 *
 * Writes a NEW append-only `loyalty_ledger` row (`kind='adjustment'`,
 * `posted_by=<admin user id>`, AC2) via the wallet service, audited under the
 * existing `loyalty` category (AC3). A debit beyond the balance is permitted and
 * is recorded as honest negative carry (S02). Reserved to `manage loyalty`
 * (admin / super_admin, AC4); 401 anon, 403 otherwise, 403 without CSRF.
 */
export function registerAdminLoyalty(app: FastifyInstance, deps: AdminLoyaltyDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  app.post(
    "/admin/parents/:parentId/loyalty/adjust",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authResult = await validateSession(
        {
          method: req.method,
          cookieHeader: req.headers.cookie ?? null,
          csrfHeader: csrfHeaderOf(req),
        },
        { sessions, resolveUser },
      );
      if (!authResult.ok) {
        reply.code(authResult.status).send({ error: authResult.error });
        return reply;
      }
      const principal: PermissionPrincipal = {
        id: authResult.user.id,
        role: authResult.user.role,
      };
      const decision = guard(principal);
      if (!decision.ok) {
        reply.code(decision.status).send({ error: decision.error });
        return reply;
      }

      const parsed = loyaltyAdjustSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply
          .code(400)
          .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }

      const { parentId } = req.params as { parentId: string };
      // The target must exist and be a parent — never adjust a staff login.
      const [target] = await db.select().from(users).where(eq(users.id, parentId));
      if (!target || target.role !== "parent") {
        return reply.code(404).send({ error: "Parent not found" });
      }

      try {
        const result = await adjustLoyaltyPoints({
          db,
          parentId,
          points: parsed.data.points,
          reason: parsed.data.reason,
          adminUserId: authResult.user.id,
        });

        await audit(db, {
          actor: authResult.user.id,
          action: "loyalty.adjust",
          target: { table: "loyalty_ledger", id: result.ledgerId },
          // Records the signed points + reason (the "why") — never any secret.
          payload: {
            parentId,
            points: result.pointsDelta,
            reason: parsed.data.reason,
            balanceAfter: result.balanceAfter,
            negativeCarry: result.negativeCarry,
          },
        });

        return reply.code(201).send({
          ledgerId: result.ledgerId,
          parentId,
          points: result.pointsDelta,
          balance: result.balanceAfter,
          negativeCarry: result.negativeCarry,
        });
      } catch (err: unknown) {
        if (err instanceof LoyaltyAdjustmentError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // Read the current loyalty balance for a parent (so the Adjust UI can show it).
  app.get(
    "/admin/parents/:parentId/loyalty",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authResult = await validateSession(
        {
          method: req.method,
          cookieHeader: req.headers.cookie ?? null,
          csrfHeader: csrfHeaderOf(req),
        },
        { sessions, resolveUser },
      );
      if (!authResult.ok) {
        reply.code(authResult.status).send({ error: authResult.error });
        return reply;
      }
      const decision = guard({ id: authResult.user.id, role: authResult.user.role });
      if (!decision.ok) {
        reply.code(decision.status).send({ error: decision.error });
        return reply;
      }
      const { parentId } = req.params as { parentId: string };
      const balance = await loyaltyBalance(db, parentId);
      return reply.code(200).send({ parentId, balance });
    },
  );
}
