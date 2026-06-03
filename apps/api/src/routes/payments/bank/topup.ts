import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  audit,
  bankTransferPending,
  parents,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { bankTransferRecordSchema, bankTransferConfirmSchema } from "@bm/contracts";
import { confirmBankTransfer, BANK_MANUAL_SOURCE } from "@bm/payments";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { PaymentsDeps } from "../mpesa/index.js";

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
 * Bank transfer confirmation is reserved for admin (`manage wallet`) and treasury
 * (`manage float`) — the two roles that own crediting and float reconciliation.
 * Reception/cashier hold only `create payment` / `read wallet`, so they cannot
 * confirm; accountants/packers are read-only. This is a deliberate OR over two
 * rbac grants (no single resource is held by exactly {admin, treasury}).
 */
function canHandleBankTransfer(principal: PermissionPrincipal): boolean {
  return can(principal.role, "manage", "wallet") || can(principal.role, "manage", "float");
}

/**
 * Bank transfer top-up, admin-confirmed (P1-E04-S07).
 *
 * POST  /payments/bank/transfers          — admin records a pending transfer (AC1).
 * POST  /payments/bank/transfers/:id/confirm — admin matches a parent + confirms,
 *   crediting the wallet via `@bm/wallet` with `source='bank:manual'` and the
 *   pending row id as the idempotency key, so a double-confirm cannot
 *   double-credit (AC2). The parent is SMS-stub notified (AC3).
 *
 * Both routes are guarded to admin/treasury. The confirming actor is the session
 * user (`posted_by`/`confirmed_by`) — never accepted from the client. Audited.
 */
export function registerBankTransferRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const sms: SmsSender = deps.sms ?? new StubSmsSender(db);

  /** Authenticate + enforce admin/treasury. Returns the live principal or sends an error. */
  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
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
    if (!canHandleBankTransfer(auth.user)) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // AC1: record a pending bank transfer (manual admin entry).
  app.post("/payments/bank/transfers", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = bankTransferRecordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { amount, reference, parentId } = parsed.data;

    // If a parent is supplied at record time, it must be a real parent user.
    if (parentId) {
      const [parentUser] = await db.select().from(users).where(eq(users.id, parentId));
      if (!parentUser) return reply.code(404).send({ error: "Parent not found" });
    }

    const [row] = await db
      .insert(bankTransferPending)
      .values({ amount, reference, parentId: parentId ?? null })
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "payment.bank.record",
      target: { table: "bank_transfer_pending", id: row!.id },
      payload: { amount, reference, parent_id: parentId ?? null, ip: req.ip },
    });

    return reply.code(201).send({
      id: row!.id,
      amount: row!.amount,
      reference: row!.reference,
      parentId: row!.parentId,
      status: row!.status,
    });
  });

  // AC2/AC3: match a parent + confirm → credit the wallet (idempotent), notify.
  app.post(
    "/payments/bank/transfers/:id/confirm",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;

      const parsed = bankTransferConfirmSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply
          .code(400)
          .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
      }
      const { parentId } = parsed.data;
      const { id } = req.params as { id: string };

      const [pending] = await db
        .select()
        .from(bankTransferPending)
        .where(eq(bankTransferPending.id, id));
      if (!pending) return reply.code(404).send({ error: "Bank transfer not found" });
      // A re-confirm with the SAME parent is a benign idempotent retry (the credit
      // is keyed on the pending id, so no double-credit). But a re-confirm naming a
      // DIFFERENT parent must be rejected: the money was already credited to the
      // original parent, and proceeding would overwrite parent_id/confirmed_by
      // below, falsifying the durable record against the authoritative ledger.
      if (pending.status === "confirmed" && pending.parentId !== parentId) {
        return reply
          .code(409)
          .send({ error: "Bank transfer already confirmed for a different parent" });
      }

      // Resolve the matched parent: user (for the SMS phone), profile (FIFO keys
      // on parents.id), and wallet (derived server-side, never client-supplied).
      const [parentUser] = await db.select().from(users).where(eq(users.id, parentId));
      if (!parentUser) return reply.code(404).send({ error: "Parent not found" });
      const [parentProfile] = await db
        .select()
        .from(parents)
        .where(eq(parents.userId, parentId));
      if (!parentProfile) return reply.code(404).send({ error: "Parent profile not found" });
      const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, parentId));
      if (!wallet) return reply.code(404).send({ error: "Wallet not found" });

      // Credit lands via the idempotent FIFO primitive, keyed on the pending row
      // id — a double-confirm reuses the key and posts NO second credit (AC2).
      const charge = await confirmBankTransfer(db, {
        pendingId: pending.id,
        parentId: parentProfile.id,
        walletId: wallet.id,
        amount: pending.amount,
        postedBy: actor.id,
      });

      // Mark confirmed + record who matched it. The status flip is idempotent
      // (already-confirmed rows stay confirmed); the ledger is the credit guard.
      await db
        .update(bankTransferPending)
        .set({
          status: "confirmed",
          parentId,
          confirmedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(bankTransferPending.id, pending.id));

      // A replay credited nothing — do not re-audit or re-notify (idempotent).
      if (!charge.replayed) {
        await audit(db, {
          actor: actor.id,
          action: "payment.bank.confirm",
          target: { table: "wallet_ledger", id: charge.ledgerEntryId },
          payload: {
            pending_id: pending.id,
            parent_id: parentId,
            wallet_id: wallet.id,
            amount: pending.amount,
            source: BANK_MANUAL_SOURCE,
            settled: charge.settled,
            residual: charge.residual,
            ip: req.ip,
          },
        });

        // AC3: transactional SMS-stub for the parent. The ledger credit is the
        // source of truth; an SMS failure must not undo it, so it is best-effort.
        await sms
          .send({
            to: parentUser.phone,
            template: "wallet.topup.bank",
            data: { amountKes: (pending.amount / 100).toFixed(2) },
          })
          .catch(() => {});
      }

      return reply.code(200).send({
        id: pending.id,
        status: "confirmed",
        ledgerEntryId: charge.ledgerEntryId,
        source: charge.source,
        settled: charge.settled,
        residual: charge.residual,
        replayed: charge.replayed,
      });
    },
  );
}
