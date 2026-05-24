import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, wallets, walletLedger, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { refundSchema } from "@bm/contracts";
import {
  refund,
  RefundExceedsRefundableError,
  RefundReasonRequiredError,
  RefundTargetNotFoundError,
} from "@bm/wallet";
import { StubSmsSender, type SmsSender } from "@bm/sms";
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
 * Admin refund recording (P1-E03-S06).
 *
 * POST /admin/refunds — records an offline refund as a NEW reversing
 * `wallet_ledger` entry (`kind='refund'`, `reverses_entry_id`=original) — the
 * ledger is append-only, the original is never mutated. Partial refunds are
 * tracked and capped at the original's remaining-refundable amount (AC4); a
 * reason code is required (AC1). On success a transactional SMS stub is queued
 * for the parent (AC3) and the action is audited (DoD).
 *
 * Guarded to `manage refund`, which only `admin` and `super_admin` hold (AC5).
 * Treasury/accountant hold `create`/`read refund` but NOT `manage`, so they are
 * rejected here — refund RECORDING is admin-only by this story.
 */
export function registerAdminRefund(app: FastifyInstance, deps: AdminDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("manage", "refund");
  const sms: SmsSender = deps.sms ?? new StubSmsSender(db);

  app.post("/admin/refunds", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = refundSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { originalEntryId, amount, reasonCode, note, idempotencyKey } = parsed.data;

    try {
      const result = await refund(db, {
        originalEntryId,
        amount,
        reasonCode,
        note: note ?? undefined,
        postedBy: auth.user.id,
        idempotencyKey,
      });

      // AC3: queue a transactional SMS-stub notification for the parent. The
      // refund is the source of truth either way; an SMS failure must not undo
      // the committed reversing entry, so it is best-effort after the post.
      if (!result.replayed) {
        await notifyParent(db, sms, result.ledgerEntryId, amount).catch(() => {});
      }

      return reply.code(201).send({
        ledgerEntryId: result.ledgerEntryId,
        originalEntryId: result.originalEntryId,
        amount: result.amount,
        remainingRefundable: result.remainingRefundable,
        replayed: result.replayed,
      });
    } catch (err) {
      if (err instanceof RefundReasonRequiredError) {
        return reply.code(400).send({ error: "A reason code is required", field: "reasonCode" });
      }
      if (err instanceof RefundTargetNotFoundError) {
        return reply.code(404).send({ error: "Original ledger entry not found" });
      }
      if (err instanceof RefundExceedsRefundableError) {
        return reply.code(409).send({
          error: "Refund exceeds the remaining-refundable amount",
          remaining: err.remaining,
        });
      }
      throw err;
    }
  });
}

/** Resolve the parent's phone from the refunded ledger entry and SMS them. */
async function notifyParent(
  db: Database,
  sms: SmsSender,
  ledgerEntryId: string,
  amount: number,
): Promise<void> {
  const [entry] = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.id, ledgerEntryId));
  if (!entry) return;
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId));
  if (!wallet) return;
  const [user] = await db.select().from(users).where(eq(users.id, wallet.userId));
  if (!user) return;
  await sms.send({
    phone: user.phone,
    body: `A refund of KES ${(amount / 100).toFixed(2)} has been recorded to your wallet.`,
    template: "wallet.refund",
  });
}
