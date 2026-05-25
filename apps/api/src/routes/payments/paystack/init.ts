import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { audit, parents, paystackTransactions, users, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  paystackInitSchema,
  kesToMinorUnits,
  type PaystackTxState,
} from "@bm/contracts";
import {
  createPaystackAdapter,
  PaystackTransportError,
  type PaystackConfig,
  type PaystackTransport,
} from "@bm/payments";
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

/** Injected Paystack wiring: secret-key config + a mockable transport. */
export interface PaystackRouteConfig {
  config: PaystackConfig;
  transport: PaystackTransport;
}

/** Map a Paystack verify outcome to the persisted/surfaced transaction state. */
function stateFromVerify(status: "success" | "failed" | "pending"): PaystackTxState {
  if (status === "success") return "SUCCEEDED";
  if (status === "failed") return "FAILED";
  return "INITIALIZED";
}

/**
 * Parent-initiated Paystack card top-up (P1-E04-S04).
 *
 * - POST /payments/paystack/init → initialize a hosted-checkout transaction for
 *   the authed parent's OWN wallet (AC1, AC4). Generates a UUID `reference`,
 *   derives the wallet + payer email server-side, calls Paystack via the injected
 *   adapter, persists one `paystack_transaction` keyed by that reference in state
 *   `INITIALIZED`, and writes an audit row in the same transaction. The wallet
 *   credit lands later on the verified webhook (P1-E04-S05).
 * - GET /payments/paystack/verify/:reference → hit on redirect-back (AC2/AC3).
 *   Calls `transaction/verify` for UX confirmation, advances the row's state, and
 *   captures the saved card authorization when the parent opted into card-on-file.
 *   The webhook (S05) remains the authoritative source of truth for crediting.
 *
 * Requires an authenticated parent session with `create payment`; the mutating
 * verb also requires the CSRF double-submit token. The wallet + email are derived
 * from the session — never accepted from the client. The Paystack secret key is
 * server-only (env); only the public key is exposed client-side.
 */
export function registerPaystackInit(
  app: FastifyInstance,
  { db, sessions, paystack }: PaymentsDeps,
): void {
  if (!paystack) return;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");
  const adapter = createPaystackAdapter({
    config: paystack.config,
    transport: paystack.transport,
  });

  app.post("/payments/paystack/init", async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = paystackInitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { amountKes, saveCard } = parsed.data;
    const userId = auth.user.id;

    // Derive the wallet + payer email from the session (never the client body).
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) return reply.code(404).send({ error: "Wallet not found" });
    const [profile] = await db.select().from(parents).where(eq(parents.userId, userId));
    const email = profile?.email ?? null;
    if (!email) {
      // Paystack keys the customer + receipt on the email; it is mandatory.
      return reply
        .code(422)
        .send({ error: "Add an email to your profile before paying by card" });
    }

    const reference = randomUUID();
    const amount = kesToMinorUnits(amountKes);

    let charge;
    try {
      charge = await adapter.init({ email, amount, reference });
    } catch (err) {
      if (err instanceof PaystackTransportError) {
        return reply.code(502).send({ error: "Card payments are temporarily unavailable" });
      }
      throw err;
    }

    if (charge.status !== "pending" || !charge.authorizationUrl) {
      // Paystack rejected the init — surface as an upstream failure; nothing is
      // persisted (no checkout to track, no webhook will arrive).
      return reply
        .code(502)
        .send({ error: charge.failureReason ?? "Paystack rejected the request" });
    }

    const state: PaystackTxState = "INITIALIZED";
    await db.transaction(async (tx) => {
      await tx.insert(paystackTransactions).values({
        reference,
        parentId: userId,
        walletId: wallet.id,
        amount,
        email,
        saveCard,
        state,
      });
      await audit(tx, {
        actor: userId,
        action: "payment.paystack.init",
        target: { table: "paystack_transaction", id: reference },
        payload: {
          amount_minor: amount,
          wallet_id: wallet.id,
          reference,
          save_card: saveCard,
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });
    });

    return reply.code(202).send({ reference, authorizationUrl: charge.authorizationUrl, state });
  });

  // AC2/AC3: redirect-back verify for one of the parent's OWN transactions.
  app.get(
    "/payments/paystack/verify/:reference",
    async (req: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
      const authResult = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!authResult.ok) return reply.code(authResult.status).send({ error: authResult.error });

      const { reference } = req.params;
      const [row] = await db
        .select()
        .from(paystackTransactions)
        .where(
          and(
            eq(paystackTransactions.reference, reference),
            eq(paystackTransactions.parentId, authResult.user.id),
          ),
        );
      if (!row) return reply.code(404).send({ error: "Transaction not found" });

      // Already terminal (e.g. webhook arrived first) — don't re-verify; the
      // webhook (S05) is the source of truth for crediting.
      if (row.state !== "INITIALIZED") {
        return reply.code(200).send({ reference: row.reference, state: row.state as PaystackTxState });
      }

      let result;
      try {
        result = await adapter.verify({ reference });
      } catch (err) {
        if (err instanceof PaystackTransportError) {
          return reply.code(502).send({ error: "Could not verify the payment yet" });
        }
        throw err;
      }

      const nextState = stateFromVerify(result.status);
      // Only persist a terminal transition; keep INITIALIZED while still pending.
      if (nextState !== "INITIALIZED") {
        // Capture the saved authorization only when the parent opted in (AC4) and
        // Paystack flagged the card reusable.
        const authorizationCode =
          row.saveCard && result.authorization?.reusable
            ? result.authorization.authorizationCode
            : null;
        await db
          .update(paystackTransactions)
          .set({ state: nextState, authorizationCode, updatedAt: new Date() })
          .where(eq(paystackTransactions.reference, reference));
      }

      return reply.code(200).send({ reference, state: nextState });
    },
  );
}
