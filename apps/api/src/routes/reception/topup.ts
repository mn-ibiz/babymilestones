import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import {
  audit,
  mpesaStkRequests,
  parents,
  paystackTransactions,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  receptionTopupSchema,
  type MpesaStkState,
  type PaystackTxState,
  type ReceptionTopupResponse,
} from "@bm/contracts";
import {
  CASH_RECEPTION_SOURCE,
  createMpesaAdapter,
  createPaystackAdapter,
  MpesaTransportError,
  PaystackTransportError,
  recordCashTopup,
} from "@bm/payments";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { ReceptionDeps } from "./index.js";

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

/** Joined parent identity + wallet for a top-up, keyed on the parent's user id. */
interface ParentRecord {
  userId: string;
  parentId: string;
  walletId: string;
  phone: string;
  email: string | null;
}

async function loadParent(db: Database, userId: string): Promise<ParentRecord | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return null;
  const [profile] = await db.select().from(parents).where(eq(parents.userId, userId));
  if (!profile) return null;
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) return null;
  return {
    userId: u.id,
    parentId: profile.id,
    walletId: wallet.id,
    phone: u.phone,
    email: profile.email ?? null,
  };
}

/**
 * Reception unified top-up (P1-E05-S03).
 *
 * POST /reception/topup — one staff endpoint that dispatches by `method`,
 * reusing the epic-4 payment primitives rather than re-implementing any rail:
 *  - `cash`        → synchronous credit via the cash adapter (`@bm/wallet`
 *                    FIFO settle, `source='cash:reception'`); receipt SMS-stub
 *                    fires immediately (AC3). 201 settled.
 *  - `mpesa_stk`   → STK push to the *parent's* phone via the Daraja adapter;
 *                    the wallet credit lands async on the C2B/STK callback
 *                    (P1-E04-S02), kept idempotent there. 202 pending; the sheet
 *                    polls GET /reception/topup/mpesa_stk/:id for live status (AC2).
 *  - `paystack_card` → hosted-checkout init via the Paystack adapter; credit lands
 *                    on the verified webhook (P1-E04-S05). 202 pending + authUrl.
 *  - `bank_transfer` → admin-confirmed elsewhere (P1-E04-S07); rejected here (422).
 *
 * Staff-only via rbac `create payment` (Reception + Cashier hold it; admin,
 * accountant, treasury, packer do not → 403). The mutating verb also requires the
 * CSRF double-submit token. The wallet + payer phone/email are derived
 * server-side from `parentId` — never accepted from the client. Every dispatched
 * method writes one `reception.topup` audit row carrying the `method` (AC4). The
 * staff actor is the session user (`posted_by`/`actor`), never the body.
 */
export function registerReceptionTopup(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");
  const sms: SmsSender = deps.sms ?? new StubSmsSender(db);

  const mpesaAdapter = deps.mpesa
    ? createMpesaAdapter({
        config: deps.mpesa.config,
        transport: deps.mpesa.transport,
        now: deps.mpesa.now,
      })
    : null;
  const paystackAdapter = deps.paystack
    ? createPaystackAdapter({ config: deps.paystack.config, transport: deps.paystack.transport })
    : null;

  app.post("/reception/topup", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = receptionTopupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .code(400)
        .send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { parentId, method, amount, idempotencyKey } = parsed.data;
    const staffId = auth.user.id;

    const parent = await loadParent(db, parentId);
    if (!parent) return reply.code(404).send({ error: "Parent not found" });

    // ---- cash: synchronous credit + immediate receipt (AC3) --------------
    if (method === "cash") {
      const charge = await recordCashTopup(db, {
        parentId: parent.parentId,
        walletId: parent.walletId,
        amount,
        postedBy: staffId,
        idempotencyKey: idempotencyKey ?? `reception:cash:${parent.walletId}:${parentId}:${amount}`,
      });
      if (!charge.replayed) {
        await audit(db, {
          actor: staffId,
          action: "reception.topup",
          target: { table: "wallet_ledger", id: charge.ledgerEntryId },
          payload: {
            method,
            parent_id: parentId,
            wallet_id: parent.walletId,
            amount,
            source: CASH_RECEPTION_SOURCE,
            settled: charge.settled,
            residual: charge.residual,
            ip: req.ip,
            user_agent: req.headers["user-agent"] ?? null,
          },
        });
        await sms
          .send({
            to: parent.phone,
            template: "wallet.topup.cash",
            data: { amountKes: (amount / 100).toFixed(2) },
          })
          .catch(() => {});
      }
      const out: ReceptionTopupResponse = {
        method,
        status: "settled",
        transactionId: null,
        ledgerEntryId: charge.ledgerEntryId,
        replayed: charge.replayed,
      };
      return reply.code(201).send(out);
    }

    // Provider rails transact in whole shillings; the body carries integer cents.
    const amountKes = Math.round(amount / 100);

    // ---- M-Pesa STK: push to the parent's phone, credit async (AC2) ------
    if (method === "mpesa_stk") {
      if (!mpesaAdapter) {
        return reply.code(503).send({ error: "M-Pesa is not configured" });
      }
      let charge;
      try {
        charge = await mpesaAdapter.stkPush({
          amountKes,
          phone: parent.phone,
          accountRef: parent.walletId,
          description: "Wallet top-up",
        });
      } catch (err) {
        if (err instanceof MpesaTransportError) {
          return reply.code(502).send({ error: "M-Pesa is temporarily unavailable" });
        }
        throw err;
      }
      if (charge.status !== "pending" || !charge.checkoutRequestId || !charge.merchantRequestId) {
        return reply
          .code(502)
          .send({ error: charge.failureReason ?? "M-Pesa rejected the request" });
      }
      const state: MpesaStkState = "STK_SENT";
      await db.transaction(async (tx) => {
        await tx.insert(mpesaStkRequests).values({
          checkoutRequestId: charge.checkoutRequestId!,
          merchantRequestId: charge.merchantRequestId!,
          parentId,
          walletId: parent.walletId,
          amount: amountKes,
          phone: parent.phone,
          state,
        });
        await audit(tx, {
          actor: staffId,
          action: "reception.topup",
          target: { table: "mpesa_stk_request", id: charge.checkoutRequestId! },
          payload: {
            method,
            parent_id: parentId,
            wallet_id: parent.walletId,
            amount_kes: amountKes,
            checkout_request_id: charge.checkoutRequestId,
            ip: req.ip,
            user_agent: req.headers["user-agent"] ?? null,
          },
        });
      });
      const out: ReceptionTopupResponse = {
        method,
        status: "pending",
        transactionId: charge.checkoutRequestId,
      };
      return reply.code(202).send(out);
    }

    // ---- Paystack: hosted-checkout init, credit on webhook ---------------
    if (method === "paystack_card") {
      if (!paystackAdapter) {
        return reply.code(503).send({ error: "Card payments are not configured" });
      }
      if (!parent.email) {
        return reply
          .code(422)
          .send({ error: "Add an email to the parent's profile before paying by card" });
      }
      const reference = randomUUID();
      let charge;
      try {
        charge = await paystackAdapter.init({ email: parent.email, amount, reference });
      } catch (err) {
        if (err instanceof PaystackTransportError) {
          return reply.code(502).send({ error: "Card payments are temporarily unavailable" });
        }
        throw err;
      }
      if (charge.status !== "pending" || !charge.authorizationUrl) {
        return reply
          .code(502)
          .send({ error: charge.failureReason ?? "Paystack rejected the request" });
      }
      const state: PaystackTxState = "INITIALIZED";
      await db.transaction(async (tx) => {
        await tx.insert(paystackTransactions).values({
          reference,
          parentId,
          walletId: parent.walletId,
          amount,
          email: parent.email!,
          saveCard: false,
          state,
        });
        await audit(tx, {
          actor: staffId,
          action: "reception.topup",
          target: { table: "paystack_transaction", id: reference },
          payload: {
            method,
            parent_id: parentId,
            wallet_id: parent.walletId,
            amount_minor: amount,
            reference,
            ip: req.ip,
            user_agent: req.headers["user-agent"] ?? null,
          },
        });
      });
      const out: ReceptionTopupResponse = {
        method,
        status: "pending",
        transactionId: reference,
        authorizationUrl: charge.authorizationUrl,
      };
      return reply.code(202).send(out);
    }

    // ---- bank_transfer: admin-confirmed elsewhere (P1-E04-S07) -----------
    return reply.code(422).send({
      error: "Bank transfers are confirmed by an admin — record it in the bank transfer flow",
    });
  });

  // AC2: live status polling for an STK top-up the reception staff initiated.
  app.get(
    "/reception/topup/mpesa_stk/:checkoutRequestId",
    async (
      req: FastifyRequest<{ Params: { checkoutRequestId: string } }>,
      reply: FastifyReply,
    ) => {
      const authResult = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!authResult.ok) return reply.code(authResult.status).send({ error: authResult.error });
      const perm = guard(authResult.user);
      if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

      const { checkoutRequestId } = req.params;
      const [row] = await db
        .select()
        .from(mpesaStkRequests)
        .where(eq(mpesaStkRequests.checkoutRequestId, checkoutRequestId))
        .orderBy(desc(mpesaStkRequests.createdAt));
      if (!row) return reply.code(404).send({ error: "STK request not found" });

      return reply
        .code(200)
        .send({ checkoutRequestId: row.checkoutRequestId, state: row.state as MpesaStkState });
    },
  );
}
