import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { invoices, parents, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { checkInSchema } from "@bm/contracts";
import { debit, DoubleCheckInError } from "@bm/wallet";
import type { ParentsDeps } from "./index.js";

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
 * Reception check-in debit (P1-E03-S05).
 *
 * POST /parents/check-in — debits the parent's wallet for a pending invoice and
 * resolves it (AC2–AC5). The server derives the wallet from the invoice's parent
 * (one wallet per user); a client-supplied wallet id is never trusted for a
 * money movement. The booking ALWAYS proceeds: an underfunded check-in with
 * auto-credit off resolves to `outstanding` (200, no debit), not an error (AC5).
 *
 * Requires an authenticated staff session with `create payment` (reception,
 * cashier, parent-initiated payments) plus the CSRF double-submit token.
 */
export function registerReceptionCheckIn(
  app: FastifyInstance,
  { db, sessions }: ParentsDeps,
): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");

  app.post("/parents/check-in", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = checkInSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { invoiceId } = parsed.data;

    // Resolve the wallet from the invoice's parent → user → wallet. The server
    // owns this linkage; the client only names the invoice.
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) return reply.code(404).send({ error: "Invoice not found" });

    const [parent] = await db.select().from(parents).where(eq(parents.id, inv.parentId));
    if (!parent) return reply.code(404).send({ error: "Parent not found" });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, parent.userId));
    if (!wallet) return reply.code(404).send({ error: "Wallet not found" });

    const idempotencyKey = parsed.data.idempotencyKey ?? `checkin:${invoiceId}`;

    try {
      const result = await debit(db, {
        walletId: wallet.id,
        invoiceId,
        idempotencyKey,
        source: "checkin",
        postedBy: auth.user.id,
      });
      return reply.code(200).send({
        outcome: result.outcome,
        debited: result.debited,
        invoiceId: result.invoiceId,
        replayed: result.replayed,
      });
    } catch (err) {
      // AC6: a distinct second check-in for an already-debited invoice.
      if (err instanceof DoubleCheckInError) {
        return reply
          .code(409)
          .send({ error: "This invoice has already been checked in", invoiceId });
      }
      // Invoice not pending (e.g. already settled by a top-up) → conflict.
      if (err instanceof Error && err.message.match(/not pending/iu)) {
        return reply.code(409).send({ error: "Invoice is not open for check-in", invoiceId });
      }
      throw err;
    }
  });
}
