import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  voidReceipt,
  AlreadyVoidedError,
  VoidReceiptNotFoundError,
  VoidTargetIsVoidError,
} from "@bm/payments";
import type { ReceiptsDeps } from "./index.js";

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
 * Receipt void (P1-E08-S05).
 *
 * POST /receipts/:id/void — voids a receipt by appending a NEW reversing
 * receipt (`kind='void'`, `reverses_receipt_id`=original) with negated
 * totals/lines so the original + void nets to 0 (AC1/AC2). The original is never
 * deleted or mutated — the receipt record stays auditable (mirrors the wallet
 * refund reversing pattern). An already-voided receipt — and a void row itself —
 * cannot be voided again (AC3). The action is audited as `receipt.voided` (DoD).
 *
 * Admin-only: guarded to `manage receipt`, which only `admin`/`super_admin`
 * hold. Cashiers hold `create`/`read receipt` but not `manage`, so they are
 * rejected here. The mutating verb requires the CSRF double-submit token.
 */
export function registerReceiptVoid(app: FastifyInstance, deps: ReceiptsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("manage", "receipt");

  app.post("/receipts/:id/void", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = guard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const { id } = req.params as { id: string };
    try {
      const result = await voidReceipt(db, { receiptId: id, postedBy: auth.user.id });
      return reply.code(201).send({
        voidReceiptId: result.voidReceiptId,
        originalReceiptId: result.originalReceiptId,
      });
    } catch (err) {
      if (err instanceof VoidReceiptNotFoundError) {
        return reply.code(404).send({ error: "Receipt not found" });
      }
      if (err instanceof AlreadyVoidedError) {
        return reply.code(409).send({ error: "Receipt is already voided" });
      }
      if (err instanceof VoidTargetIsVoidError) {
        return reply.code(409).send({ error: "A void receipt cannot be voided" });
      }
      throw err;
    }
  });
}
