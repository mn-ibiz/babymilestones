import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, parents, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { cashTopupSchema } from "@bm/contracts";
import { recordCashTopup, CASH_RECEPTION_SOURCE } from "@bm/payments";
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
 * Cash top-up recorded by Reception/Cashier (P1-E04-S06).
 *
 * POST /payments/cash/topup — staff at the counter funds a parent's wallet with
 * cash already handed over. The credit lands through the idempotent FIFO
 * settlement primitive (`@bm/wallet.applyTopup`, via the cash adapter) so it
 * posts ONE `wallet_ledger` credit with `kind='topup'`, `source='cash:reception'`,
 * `posted_by=<staff id>` (AC2) and settles the parent's oldest outstanding
 * invoices first. The staff actor is the session user — never accepted from the
 * client. On success an audit row is written and an SMS-stub is queued for the
 * parent (AC3). The action is idempotent on `idempotencyKey` (a replay credits
 * nothing and notifies no one).
 *
 * Guarded to `create payment`, which Reception and Cashier hold; admins,
 * accountants, treasury and packers do NOT, so they are rejected (AC1).
 * Treasury reconciliation (P1-E06) reads `source='cash:reception'` as cash float
 * (AC4) — the constant is fixed in the cash adapter.
 */
export function registerCashTopup(app: FastifyInstance, deps: PaymentsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");
  const sms: SmsSender = deps.sms ?? new StubSmsSender(db);

  app.post("/payments/cash/topup", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = cashTopupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { parentId, amount, idempotencyKey } = parsed.data;
    const staffId = auth.user.id;

    // `parentId` is the parent's *user* id. Resolve the user (for the SMS phone),
    // the parent profile (FIFO settlement keys on parents.id), and the wallet.
    // The wallet is derived server-side — never accepted from the client.
    const [parentUser] = await db.select().from(users).where(eq(users.id, parentId));
    if (!parentUser) return reply.code(404).send({ error: "Parent not found" });
    const [parentProfile] = await db.select().from(parents).where(eq(parents.userId, parentId));
    if (!parentProfile) return reply.code(404).send({ error: "Parent profile not found" });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, parentId));
    if (!wallet) return reply.code(404).send({ error: "Wallet not found" });

    // The cash credit lands via the idempotent FIFO settlement primitive with the
    // fixed cash:reception source + the staff actor as posted_by (AC2). FIFO
    // settlement scans this parent's outstanding invoices (keyed on parents.id).
    const charge = await recordCashTopup(db, {
      parentId: parentProfile.id,
      walletId: wallet.id,
      amount,
      postedBy: staffId,
      idempotencyKey: idempotencyKey ?? `cash:${wallet.id}:${parentId}:${amount}`,
    });

    // A replay credited nothing — do not re-audit or re-notify (idempotent).
    if (!charge.replayed) {
      await audit(db, {
        actor: staffId,
        action: "payment.cash.topup",
        target: { table: "wallet_ledger", id: charge.ledgerEntryId },
        payload: {
          parent_id: parentId,
          wallet_id: wallet.id,
          amount,
          source: CASH_RECEPTION_SOURCE,
          settled: charge.settled,
          residual: charge.residual,
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });

      // AC3: receipt + transactional SMS-stub for the parent. The ledger credit is
      // the source of truth; an SMS failure must not undo it, so it is best-effort.
      await sms
        .send({
          phone: parentUser.phone,
          body: `A cash top-up of KES ${(amount / 100).toFixed(2)} was added to your wallet.`,
          template: "wallet.topup.cash",
        })
        .catch(() => {});
    }

    return reply.code(201).send({
      ledgerEntryId: charge.ledgerEntryId,
      source: charge.source,
      settled: charge.settled,
      residual: charge.residual,
      replayed: charge.replayed,
    });
  });
}
