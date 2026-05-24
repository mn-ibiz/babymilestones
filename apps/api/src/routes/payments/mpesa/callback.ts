import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  audit,
  mpesaCallbacks,
  mpesaStkRequests,
  type Database,
  type MpesaCallbackRow,
} from "@bm/db";
import { applyTopup } from "@bm/wallet";
import type { PaymentsDeps } from "./index.js";

/**
 * Parse the (untrusted) Daraja STK callback body into the handful of fields we
 * persist. Returns null when the body is malformed (missing CheckoutRequestID).
 *
 * Daraja's STK callback shape:
 *   { "Body": { "stkCallback": {
 *       "MerchantRequestID": "...", "CheckoutRequestID": "...",
 *       "ResultCode": 0, "ResultDesc": "...",
 *       "CallbackMetadata": { "Item": [ { "Name": "Amount", "Value": 500 }, ... ] } } } }
 * We treat every field as untrusted: only structure we recognise is read, the
 * rest is stored verbatim for forensics. Money is never trusted from the body —
 * the credit amount comes from our own mpesa_stk_request row.
 */
export interface ParsedCallback {
  checkoutRequestId: string;
  merchantRequestId: string | null;
  resultCode: number;
  resultDesc: string | null;
}

export function parseStkCallback(body: unknown): ParsedCallback | null {
  if (typeof body !== "object" || body === null) return null;
  const stk = (body as Record<string, unknown>).Body;
  if (typeof stk !== "object" || stk === null) return null;
  const cb = (stk as Record<string, unknown>).stkCallback;
  if (typeof cb !== "object" || cb === null) return null;
  const c = cb as Record<string, unknown>;

  const checkoutRequestId = c.CheckoutRequestID;
  const resultCode = c.ResultCode;
  if (typeof checkoutRequestId !== "string" || checkoutRequestId.trim() === "") return null;
  if (typeof resultCode !== "number" || !Number.isInteger(resultCode)) return null;

  return {
    checkoutRequestId,
    merchantRequestId: typeof c.MerchantRequestID === "string" ? c.MerchantRequestID : null,
    resultCode,
    resultDesc: typeof c.ResultDesc === "string" ? c.ResultDesc : null,
  };
}

/** Default Daraja egress IP allowlist (Safaricom production ranges, single IPs). */
const DEFAULT_DARAJA_IPS = [
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.138",
  "196.201.212.129",
  "196.201.212.136",
  "196.201.212.74",
  "196.201.212.69",
];

export interface MpesaCallbackConfig {
  /**
   * Daraja source-IP allowlist. When non-empty, a callback from any other IP is
   * rejected. Defaults to the published Safaricom ranges. Tests pass `[]` to
   * disable the check (app.inject has no real client IP).
   */
  allowlist?: readonly string[];
}

/**
 * M-Pesa C2B/STK callback handler (P1-E04-S02). Idempotent.
 *
 * `POST /payments/mpesa/callback` — Daraja POSTs the STK result here (no auth;
 * the body is validated and treated as untrusted, with an optional source-IP
 * allowlist). The handler:
 *
 * - AC2: persists one `mpesa_callback` row keyed by `CheckoutRequestID` with
 *   `ON CONFLICT DO NOTHING`, so a retried/duplicate callback is recorded once.
 * - AC3: on `ResultCode == 0`, credits the wallet via `@bm/wallet.applyTopup`
 *   with idempotency key = `mpesa_callback.id`, so replays never double-credit
 *   (the ledger UNIQUE(idempotency_key) is the second idempotency layer).
 * - AC4: on a non-zero result, advances the request to `FAILED` + audits.
 * - AC5: an out-of-order callback (no `mpesa_stk_request` yet) is still recorded
 *   durably; the reconciliation cron (S03) credits it once the request lands.
 * - AC6: ALWAYS returns HTTP 200, even on malformed/duplicate/error input, so
 *   Daraja stops retrying. Failures are recorded internally, never surfaced.
 */
export function registerMpesaCallback(
  app: FastifyInstance,
  { db }: PaymentsDeps,
  cfg: MpesaCallbackConfig = {},
): void {
  const allowlist = cfg.allowlist ?? DEFAULT_DARAJA_IPS;

  app.post("/payments/mpesa/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    // Source-IP allowlist (best-effort defence; the body is still untrusted).
    // Always 200 so Daraja does not retry against a blocked source forever.
    if (allowlist.length > 0 && !allowlist.includes(req.ip)) {
      return reply.code(200).send({ ResultCode: 0, ResultDesc: "Ignored" });
    }

    const parsed = parseStkCallback(req.body);
    if (!parsed) {
      // Malformed: record nothing actionable, still 200 (AC6).
      return reply.code(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    try {
      await processCallback(db, parsed);
    } catch {
      // Never surface a processing failure as a non-200 — that would make Daraja
      // retry forever. The callback row (if it was inserted) persists; the
      // reconciliation cron (S03) is the safety net for any uncredited success.
    }

    // AC6: 200 in all cases.
    return reply.code(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
  });
}

/**
 * Persist the callback idempotently, then (on success) credit the wallet once,
 * or (on failure) mark the request FAILED + audit. Separated from the route so
 * the 200-always contract lives in one place and this stays pure-ish.
 */
async function processCallback(db: Database, parsed: ParsedCallback): Promise<void> {
  // AC2: idempotent insert keyed by CheckoutRequestID. A retried/duplicate
  // callback collapses to DO NOTHING and returns no row.
  const inserted = await db
    .insert(mpesaCallbacks)
    .values({
      checkoutRequestId: parsed.checkoutRequestId,
      merchantRequestId: parsed.merchantRequestId,
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      rawPayload: { ResultCode: parsed.resultCode, ResultDesc: parsed.resultDesc },
    })
    .onConflictDoNothing({ target: mpesaCallbacks.checkoutRequestId })
    .returning();

  // Already processed (Daraja retry / duplicate): nothing more to do. The
  // original delivery already credited (or failed) — replays are no-ops.
  const callback: MpesaCallbackRow | undefined = inserted[0];
  if (!callback) return;

  // Resolve the originating STK request. AC5: it may not exist yet (out-of-order
  // arrival). When absent, the callback row is recorded; the cron credits later.
  const [request] = await db
    .select()
    .from(mpesaStkRequests)
    .where(eq(mpesaStkRequests.checkoutRequestId, parsed.checkoutRequestId));

  if (parsed.resultCode === 0) {
    if (!request) {
      // Out-of-order success: recorded, credited later by reconciliation (S03).
      await audit(db, {
        actor: null,
        action: "payment.mpesa.callback.orphan",
        target: { table: "mpesa_callback", id: callback.id },
        payload: { checkout_request_id: parsed.checkoutRequestId, result_code: 0 },
      });
      return;
    }

    // AC3: credit the wallet exactly once. Idempotency key = mpesa_callback.id —
    // the ledger UNIQUE(idempotency_key) is the second guarantee on top of the
    // mpesa_callback UNIQUE, so even a re-credit attempt writes no new entry.
    // Amount is taken from OUR request row (whole KES → cents), never the body.
    await applyTopup(db, {
      parentId: request.parentId,
      walletId: request.walletId,
      amount: request.amount * 100,
      idempotencyKey: callback.id,
      source: "mpesa",
      postedBy: request.parentId,
    });
    await db
      .update(mpesaStkRequests)
      .set({ state: "SUCCEEDED", updatedAt: new Date() })
      .where(eq(mpesaStkRequests.id, request.id));
    return;
  }

  // AC4: failure path — advance state to FAILED (when the request exists) and
  // audit the reason. The callback row records the durable fact regardless.
  if (request) {
    await db
      .update(mpesaStkRequests)
      .set({ state: "FAILED", updatedAt: new Date() })
      .where(eq(mpesaStkRequests.id, request.id));
  }
  await audit(db, {
    actor: null,
    action: "payment.mpesa.callback.failed",
    target: { table: "mpesa_callback", id: callback.id },
    payload: {
      checkout_request_id: parsed.checkoutRequestId,
      result_code: parsed.resultCode,
      result_desc: parsed.resultDesc,
    },
  });
}
