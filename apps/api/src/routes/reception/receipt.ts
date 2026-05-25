import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, parents, users, walletLedger, wallets, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import {
  receiptLineDescription,
  type ReceiptPayload,
  type ReceiptResponse,
  type ReceiptSmsResponse,
} from "@bm/contracts";
import { ConsentAwareSmsSender, StubSmsSender, type SmsSender } from "@bm/sms";
import { receiptSmsBody } from "@bm/ui";
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

/** A ledger posting joined to its owning parent identity (the receipt source). */
interface ReceiptSource {
  payload: ReceiptPayload;
  /** The parent profile id — the key the SMS consent gate resolves on. */
  parentId: string;
}

/**
 * Build a receipt payload from a wallet-ledger entry (the "transaction"). The
 * wallet → user → parent join gives the parent name + phone; the entry gives
 * the amount, method (kind), source and date. Returns null when the entry is
 * unknown or has no resolvable parent. Single-posting receipt → one line item.
 */
async function loadReceipt(db: Database, transactionId: string): Promise<ReceiptSource | null> {
  const [row] = await db
    .select({
      entryId: walletLedger.id,
      amount: walletLedger.amount,
      kind: walletLedger.kind,
      source: walletLedger.source,
      createdAt: walletLedger.createdAt,
      parentId: parents.id,
      firstName: parents.firstName,
      lastName: parents.lastName,
      phone: users.phone,
    })
    .from(walletLedger)
    .innerJoin(wallets, eq(walletLedger.walletId, wallets.id))
    .innerJoin(users, eq(wallets.userId, users.id))
    .innerJoin(parents, eq(parents.userId, users.id))
    .where(eq(walletLedger.id, transactionId));
  if (!row) return null;

  const amountCents = Number(row.amount);
  const payload: ReceiptPayload = {
    transactionId: row.entryId,
    parentName: `${row.firstName} ${row.lastName}`.trim(),
    parentPhone: row.phone,
    lineItems: [{ description: receiptLineDescription(row.kind), amountCents }],
    amountCents,
    method: row.kind,
    source: row.source,
    date: new Date(row.createdAt).toISOString(),
  };
  return { payload, parentId: row.parentId };
}

/**
 * Print + SMS-stub receipt from Reception (P1-E05-S06).
 *
 * GET  /reception/receipt/:transactionId        — the printable receipt payload
 *      (AC1, AC2, AC4). Browser print is Decision 13: the API returns the
 *      structured payload; the front desk renders the `ReceiptPreview` HTML and
 *      invokes the browser's print dialog. Reprint works any time because the
 *      receipt is reproduced from the ledger entry, not cached at payment time.
 * POST /reception/receipt/:transactionId/sms     — send an SMS-stub copy (AC3).
 *      Routed through the `@bm/sms` stub adapter (P1-E09) and gated on the
 *      parent's SMS consent flag (P1-E02-S04): a non-consenting parent's copy is
 *      dropped (`sent:false`, `reason:"no_consent"`). Audited either way.
 *
 * Staff-only: the read is guarded to `read wallet`; the SMS send is a mutating
 * action guarded to `create payment` (Reception + Cashier) and requires the
 * CSRF double-submit token. This is the lightweight reception receipt — the
 * full eTIMS/KRA engine is epic P1-E08.
 */
export function registerReceipt(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const sendGuard = requirePermission("create", "payment");
  // Default to the DB-backed stub (P1-E09); tests may inject a sender.
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const consentSender = new ConsentAwareSmsSender(db, sender);

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
    guard: ReturnType<typeof requirePermission>,
  ): Promise<{ id: string } | null> {
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
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return { id: auth.user.id };
  }

  app.get(
    "/reception/receipt/:transactionId",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authorize(req, reply, readGuard))) return reply;
      const { transactionId } = req.params as { transactionId: string };
      const found = await loadReceipt(db, transactionId);
      if (!found) return reply.code(404).send({ error: "Transaction not found" });
      const body: ReceiptResponse = { receipt: found.payload };
      return reply.code(200).send(body);
    },
  );

  app.post(
    "/reception/receipt/:transactionId/sms",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply, sendGuard);
      if (!actor) return reply;
      const { transactionId } = req.params as { transactionId: string };
      const found = await loadReceipt(db, transactionId);
      if (!found) return reply.code(404).send({ error: "Transaction not found" });

      const sent = await consentSender.sendReceipt(found.parentId, {
        phone: found.payload.parentPhone,
        body: receiptSmsBody(found.payload),
        template: "reception.receipt",
      });

      await audit(db, {
        actor: actor.id,
        action: "reception.receipt_sms",
        target: { table: "wallet_ledger", id: transactionId },
        payload: {
          parent_id: found.parentId,
          sent,
          reason: sent ? null : "no_consent",
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });

      const body: ReceiptSmsResponse = {
        transactionId,
        sent,
        reason: sent ? null : "no_consent",
      };
      return reply.code(200).send(body);
    },
  );
}
