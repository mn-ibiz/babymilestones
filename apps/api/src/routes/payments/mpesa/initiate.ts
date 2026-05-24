import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { audit, mpesaStkRequests, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { mpesaStkInitiateSchema, type MpesaStkState } from "@bm/contracts";
import { createMpesaAdapter, MpesaTransportError, type MpesaConfig, type DarajaTransport } from "@bm/payments";
import type { PaymentsDeps } from "./index.js";

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

/** Injected M-Pesa wiring: Daraja config + a mockable transport. */
export interface MpesaRouteConfig {
  config: MpesaConfig;
  transport: DarajaTransport;
  now?: () => Date;
}

/**
 * Parent-initiated M-Pesa STK push (P1-E04-S01).
 *
 * - POST /payments/mpesa/stk            → initiate an STK push for the authed
 *   parent's OWN wallet (AC1, AC2, AC5). Validates the amount, calls Daraja via
 *   the injected adapter, persists one `mpesa_stk_request` keyed by the returned
 *   `CheckoutRequestID` in state `STK_SENT`, and writes an audit row in the same
 *   transaction. The wallet credit lands later on the callback (P1-E04-S02).
 * - GET  /payments/mpesa/stk/:checkoutRequestId → current state for polling
 *   (AC4), scoped to the requesting parent (ownership enforced).
 *
 * Requires an authenticated parent session with `create payment`; the mutating
 * verb also requires the CSRF double-submit token. The wallet is derived from
 * the session — never accepted from the client.
 */
export function registerMpesaStkInitiate(
  app: FastifyInstance,
  { db, sessions, mpesa }: PaymentsDeps,
): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");
  const adapter = createMpesaAdapter({
    config: mpesa.config,
    transport: mpesa.transport,
    now: mpesa.now,
  });

  app.post("/payments/mpesa/stk", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = mpesaStkInitiateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { amountKes } = parsed.data;
    const userId = auth.user.id;

    // Derive the wallet + payer phone from the session (never the client body).
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u) return reply.code(404).send({ error: "User not found" });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) return reply.code(404).send({ error: "Wallet not found" });

    // Call Daraja via the injected adapter (no real network in tests).
    let charge;
    try {
      charge = await adapter.stkPush({
        amountKes,
        phone: u.phone,
        accountRef: wallet.id,
        description: "Wallet top-up",
      });
    } catch (err) {
      if (err instanceof MpesaTransportError) {
        return reply.code(502).send({ error: "M-Pesa is temporarily unavailable" });
      }
      throw err;
    }

    if (charge.status !== "pending" || !charge.checkoutRequestId || !charge.merchantRequestId) {
      // Daraja rejected the push — surface as an upstream failure; nothing is
      // persisted (no checkout to track, callback will never arrive).
      return reply
        .code(502)
        .send({ error: charge.failureReason ?? "M-Pesa rejected the request" });
    }

    const state: MpesaStkState = "STK_SENT";
    await db.transaction(async (tx) => {
      await tx.insert(mpesaStkRequests).values({
        checkoutRequestId: charge.checkoutRequestId!,
        merchantRequestId: charge.merchantRequestId!,
        parentId: userId,
        walletId: wallet.id,
        amount: amountKes,
        phone: u.phone,
        state,
      });
      // AC5: audited initiation (no credential/secret in the payload).
      await audit(tx, {
        actor: userId,
        action: "payment.mpesa.stk.initiate",
        target: { table: "mpesa_stk_request", id: charge.checkoutRequestId! },
        payload: {
          amount_kes: amountKes,
          wallet_id: wallet.id,
          checkout_request_id: charge.checkoutRequestId,
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });
    });

    return reply.code(202).send({ checkoutRequestId: charge.checkoutRequestId, state });
  });

  // AC4: poll the current state of one of the parent's OWN STK requests.
  app.get(
    "/payments/mpesa/stk/:checkoutRequestId",
    async (req: FastifyRequest<{ Params: { checkoutRequestId: string } }>, reply: FastifyReply) => {
      const authResult = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!authResult.ok) return reply.code(authResult.status).send({ error: authResult.error });

      const { checkoutRequestId } = req.params;
      const [row] = await db
        .select()
        .from(mpesaStkRequests)
        .where(
          and(
            eq(mpesaStkRequests.checkoutRequestId, checkoutRequestId),
            eq(mpesaStkRequests.parentId, authResult.user.id),
          ),
        )
        .orderBy(desc(mpesaStkRequests.createdAt));
      if (!row) return reply.code(404).send({ error: "STK request not found" });

      return reply
        .code(200)
        .send({ checkoutRequestId: row.checkoutRequestId, state: row.state as MpesaStkState });
    },
  );
}
