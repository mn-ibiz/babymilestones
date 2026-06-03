import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  audit,
  paystackEvents,
  paystackTransactions,
  type Database,
} from "@bm/db";
import { post as walletPost } from "@bm/wallet";
import { verifyPaystackSignature } from "@bm/payments";
import type { PaymentsDeps } from "../mpesa/index.js";

const SIGNATURE_HEADER = "x-paystack-signature";

/** The slice of a Paystack webhook payload we route on. Everything untrusted. */
interface ParsedEvent {
  /** Paystack event id (`data.id`), the replay/idempotency key. */
  id: string;
  /** Event type, e.g. `charge.success`. */
  event: string;
  /** Client reference we generated (echoed by Paystack), if present. */
  reference: string | null;
}

/**
 * Parse the (already signature-verified) webhook body into the fields we use.
 * Returns null when the shape is missing the event id we key on. Every field is
 * treated as untrusted structure; money is never read from here (the credit
 * amount comes from OUR paystack_transaction row).
 */
export function parsePaystackEvent(body: unknown): ParsedEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const event = b.event;
  const data = b.data;
  if (typeof event !== "string" || event.trim() === "") return null;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  // Paystack's data.id is a number; coerce to a stable string key. Reject when
  // absent (we cannot guard replay without it).
  const rawId = d.id;
  if (typeof rawId !== "number" && typeof rawId !== "string") return null;
  const id = String(rawId);
  if (id.trim() === "") return null;

  const reference = typeof d.reference === "string" ? d.reference : null;
  return { id, event, reference };
}

/** Read the raw request body captured by the webhook's content-type parser. */
function rawBodyOf(req: FastifyRequest): Buffer | null {
  const raw = (req as FastifyRequest & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  return null;
}

/**
 * Paystack webhook handler (P1-E04-S05). The authoritative wallet-crediting path
 * for card top-ups.
 *
 * `POST /webhooks/paystack` — Paystack POSTs signed events here (no session
 * auth; trust is cryptographic):
 *
 * - AC1: verifies `x-paystack-signature` = HMAC-SHA512 of the RAW body keyed by
 *   the secret, with a constant-time compare. The raw body is preserved by a
 *   route-scoped content-type parser (Fastify otherwise discards it).
 * - AC2: an invalid/missing signature → 401 with ZERO DB writes.
 * - AC3: inserts one `paystack_event` keyed by the Paystack event id (PRIMARY
 *   KEY) with `ON CONFLICT DO NOTHING`; a replay short-circuits to 200 with no
 *   further work (no double credit).
 * - AC4: on `charge.success`, credits the wallet via `@bm/wallet.post` with the
 *   idempotency key = the event id, using the amount from OUR transaction row
 *   (never the untrusted body), and writes an audit row.
 *
 * Registered inside an encapsulated Fastify plugin so the raw-body parser is
 * scoped to this route and never affects the JSON-parsing of other endpoints.
 */
export function registerPaystackWebhook(app: FastifyInstance, { db, paystack }: PaymentsDeps): void {
  if (!paystack) return;
  const secretKey = paystack.config.secretKey;

  app.register(async (scoped) => {
    // Capture the RAW body bytes (needed for HMAC) and still parse JSON for the
    // handler. Scoped to this plugin so other routes keep the default parser.
    scoped.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body: Buffer, done) => {
        (req as FastifyRequest & { rawBody?: Buffer }).rawBody = body;
        if (body.length === 0) {
          done(null, undefined);
          return;
        }
        try {
          done(null, JSON.parse(body.toString("utf8")));
        } catch {
          // Defer the decision to the handler: signature check runs first, so a
          // forged body never reaches JSON-shape validation. Treat as no body.
          done(null, undefined);
        }
      },
    );

    scoped.post("/webhooks/paystack", async (req: FastifyRequest, reply: FastifyReply) => {
      // AC1/AC2: verify the signature over the RAW body FIRST. Any failure → 401
      // with zero DB writes.
      const raw = rawBodyOf(req);
      const sigRaw = req.headers[SIGNATURE_HEADER];
      const signature = Array.isArray(sigRaw) ? sigRaw[0] : sigRaw;
      if (!raw || !verifyPaystackSignature(raw, signature, secretKey)) {
        return reply.code(401).send({ error: "Invalid signature" });
      }

      const parsed = parsePaystackEvent(req.body);
      // Signed but unrecognised shape: ack so Paystack stops retrying. Nothing
      // actionable to persist (no event id to key on).
      if (!parsed) return reply.code(200).send({ status: "ignored" });

      try {
        await processEvent(db, parsed);
      } catch (err) {
        // Never surface a processing failure to Paystack — the event row (when
        // inserted) persists; a re-delivery replays idempotently. Swallow so a
        // transient error does not trigger endless retries against a bad event.
        // But LOG it: there is no Paystack reconcile cron, so a failed/lost credit
        // is otherwise completely invisible (see code-review DECISIONS-NEEDED).
        req.log.error({ err }, "paystack webhook processing failed");
      }

      return reply.code(200).send({ status: "ok" });
    });
  });
}

/**
 * Persist the verified event idempotently (AC3), then on `charge.success` credit
 * the wallet exactly once (AC4). Keyed entirely off the Paystack event id so a
 * replay is a no-op at both the event table and the ledger.
 */
async function processEvent(db: Database, parsed: ParsedEvent): Promise<void> {
  // AC3: idempotent insert keyed by the Paystack event id. A replay collapses to
  // DO NOTHING and returns no row → short-circuit (no double credit).
  const inserted = await db
    .insert(paystackEvents)
    .values({
      id: parsed.id,
      event: parsed.event,
      reference: parsed.reference,
      rawPayload: { id: parsed.id, event: parsed.event, reference: parsed.reference },
    })
    .onConflictDoNothing({ target: paystackEvents.id })
    .returning();

  if (!inserted[0]) return; // Replay: already processed on first delivery.

  // AC4: only charge.success credits a wallet. Other event types are recorded
  // (the row above) for forensics but do no ledger work.
  if (parsed.event !== "charge.success") return;
  if (!parsed.reference) return;

  // Resolve the originating transaction by the reference WE generated. The
  // credit amount comes from this row, never the untrusted webhook body.
  const [txn] = await db
    .select()
    .from(paystackTransactions)
    .where(eq(paystackTransactions.reference, parsed.reference));
  if (!txn) {
    // Out-of-order / unknown reference: recorded, audited, credited nowhere.
    await audit(db, {
      actor: null,
      action: "payment.paystack.webhook.orphan",
      target: { table: "paystack_event", id: parsed.id },
      payload: { reference: parsed.reference, event: parsed.event },
    });
    return;
  }

  // AC4: credit exactly once. Idempotency key = the Paystack event id — the
  // ledger UNIQUE(idempotency_key) is the second guarantee on top of the
  // paystack_event PRIMARY KEY, so even a racing re-credit writes no new row.
  await walletPost(db, {
    walletId: txn.walletId,
    amount: txn.amount,
    kind: "topup",
    idempotencyKey: parsed.id,
    source: "paystack",
    postedBy: txn.parentId,
  });

  // Advance the transaction to SUCCEEDED (the webhook is the source of truth).
  await db
    .update(paystackTransactions)
    .set({ state: "SUCCEEDED", updatedAt: new Date() })
    .where(eq(paystackTransactions.id, txn.id));

  await audit(db, {
    actor: null,
    action: "payment.paystack.webhook.credited",
    target: { table: "paystack_event", id: parsed.id },
    payload: {
      reference: parsed.reference,
      wallet_id: txn.walletId,
      amount_minor: txn.amount,
    },
  });
}
