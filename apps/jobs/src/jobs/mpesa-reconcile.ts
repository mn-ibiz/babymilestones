import { and, eq, inArray, lt } from "drizzle-orm";
import {
  audit,
  mpesaCallbacks,
  mpesaStkRequests,
  type Database,
  type MpesaStkRequestRow,
} from "@bm/db";
import { applyTopup } from "@bm/wallet";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { StkQueryInput, StkQueryResult } from "@bm/payments";
import type { Job } from "../registry.js";

/** Just the `stkQuery` slice of the M-Pesa adapter the cron needs (mockable). */
export interface MpesaQuerier {
  stkQuery(input: StkQueryInput): Promise<StkQueryResult>;
}

export interface MpesaReconcileJobDeps {
  db: Database;
  /** M-Pesa adapter (or any object exposing `stkQuery`); transport is injected. */
  mpesa: MpesaQuerier;
  /** SMS sender for the failure notification (AC4). Defaults to the DB stub. */
  sms?: SmsSender;
  /** Clock injection for deterministic windows in tests. */
  now?: () => Date;
}

/** States that mean "the payment is still in flight, awaiting a callback". */
const PENDING_STATES = ["STK_SENT", "CALLBACK_PENDING"] as const;

/** AC2: only reconcile requests that have been pending at least this long. */
const RECONCILE_AFTER_MS = 90_000;
/** AC5: requests pending past this are abandoned and marked EXPIRED. */
const EXPIRE_AFTER_MS = 15 * 60_000;

/**
 * M-Pesa reconciliation cron (P1-E04-S03). Recovers from missing Daraja
 * callbacks so a parent is credited (or failed) even when Daraja never calls
 * back (AC1: 60s cadence).
 *
 * For each `mpesa_stk_request` still in a pending state:
 * - Stale (> 15 min, AC5): mark `EXPIRED` + audit. No Daraja call — once a push
 *   is this old it is dead, and querying would only waste a token round-trip.
 * - Older than 90s but not stale (AC2): query Daraja `stkpushquery` and:
 *   - success (AC3): credit via the SAME idempotent path as the S02 callback —
 *     record a `mpesa_callback` row (`ON CONFLICT DO NOTHING`) and credit with
 *     idempotency key = `mpesa_callback.id`. If S02 already recorded the
 *     callback and credited, the conflict + ledger UNIQUE make this a no-op, so
 *     it NEVER double-credits. Then advance the request to `SUCCEEDED`.
 *   - failure (AC4): mark `FAILED`, send an SMS-stub notification, write audit.
 *   - pending: leave it for the next run.
 *
 * Money is taken from OUR `mpesa_stk_request.amount` (whole KES → cents), never
 * from any Daraja-supplied amount.
 */
export function createMpesaReconcileJob(deps: MpesaReconcileJobDeps): Job {
  const now = deps.now ?? (() => new Date());
  const sms = deps.sms ?? new StubSmsSender(deps.db);

  return {
    name: "mpesa-reconcile",
    intervalMs: 60_000,
    run: async () => {
      const at = now();
      const reconcileCutoff = new Date(at.getTime() - RECONCILE_AFTER_MS);
      const expireCutoff = new Date(at.getTime() - EXPIRE_AFTER_MS);

      // Candidate set: pending rows that have aged past the 90s window. The
      // expiry check below decides EXPIRED vs query per-row.
      const candidates = await deps.db
        .select()
        .from(mpesaStkRequests)
        .where(
          and(
            inArray(mpesaStkRequests.state, [...PENDING_STATES]),
            lt(mpesaStkRequests.updatedAt, reconcileCutoff),
          ),
        );

      for (const request of candidates) {
        if (request.updatedAt < expireCutoff) {
          await expire(deps.db, request, at);
          continue;
        }

        let result: StkQueryResult;
        try {
          result = await deps.mpesa.stkQuery({ checkoutRequestId: request.checkoutRequestId });
        } catch {
          // Transient Daraja/transport error — leave the row for the next run.
          continue;
        }

        if (result.status === "success") {
          await reconcileSuccess(deps.db, request, at);
        } else if (result.status === "failed") {
          await reconcileFailure(deps.db, request, result, sms, at);
        }
        // pending → leave for the next run.
      }
    },
  };
}

/** AC3 — credit once via the shared idempotent callback path, then SUCCEEDED. */
async function reconcileSuccess(
  db: Database,
  request: MpesaStkRequestRow,
  at: Date,
): Promise<void> {
  // Record the callback fact idempotently (same UNIQUE(checkout_request_id) as
  // S02). If S02 already recorded it, the conflict returns no row and we reuse
  // the existing id below so the credit key matches the original.
  const inserted = await db
    .insert(mpesaCallbacks)
    .values({
      checkoutRequestId: request.checkoutRequestId,
      resultCode: 0,
      resultDesc: "Reconciled via stkpushquery (S03)",
      rawPayload: { source: "reconcile", result_code: 0 },
    })
    .onConflictDoNothing({ target: mpesaCallbacks.checkoutRequestId })
    .returning();

  let callbackId = inserted[0]?.id;
  if (!callbackId) {
    const [existing] = await db
      .select({ id: mpesaCallbacks.id })
      .from(mpesaCallbacks)
      .where(eq(mpesaCallbacks.checkoutRequestId, request.checkoutRequestId));
    callbackId = existing?.id;
  }
  if (!callbackId) return; // Should not happen; bail rather than mis-key a credit.

  // Idempotency key = mpesa_callback.id — identical to the S02 callback path, so
  // the ledger UNIQUE(idempotency_key) prevents any double credit on replay.
  await applyTopup(db, {
    parentId: request.parentId,
    walletId: request.walletId,
    amount: request.amount * 100,
    idempotencyKey: callbackId,
    source: "mpesa",
    postedBy: request.parentId,
  });

  await db
    .update(mpesaStkRequests)
    .set({ state: "SUCCEEDED", updatedAt: at })
    .where(eq(mpesaStkRequests.id, request.id));

  await audit(db, {
    actor: null,
    action: "payment.mpesa.reconcile.succeeded",
    target: { table: "mpesa_stk_request", id: request.id },
    payload: { checkout_request_id: request.checkoutRequestId },
  });
}

/** AC4 — mark FAILED, notify the parent via SMS stub, audit. */
async function reconcileFailure(
  db: Database,
  request: MpesaStkRequestRow,
  result: StkQueryResult,
  sms: SmsSender,
  at: Date,
): Promise<void> {
  await db
    .update(mpesaStkRequests)
    .set({ state: "FAILED", updatedAt: at })
    .where(eq(mpesaStkRequests.id, request.id));

  await sms.send({
    phone: request.phone,
    body: `Your M-Pesa top-up of KES ${request.amount} could not be completed. No money was deducted. Please try again.`,
    template: "payment.mpesa.failed",
  });

  await audit(db, {
    actor: null,
    action: "payment.mpesa.reconcile.failed",
    target: { table: "mpesa_stk_request", id: request.id },
    payload: {
      checkout_request_id: request.checkoutRequestId,
      result_code: result.resultCode,
      result_desc: result.resultDesc,
    },
  });
}

/** AC5 — abandon a stale (> 15 min) pending request as EXPIRED + audit. */
async function expire(db: Database, request: MpesaStkRequestRow, at: Date): Promise<void> {
  await db
    .update(mpesaStkRequests)
    .set({ state: "EXPIRED", updatedAt: at })
    .where(eq(mpesaStkRequests.id, request.id));

  await audit(db, {
    actor: null,
    action: "payment.mpesa.reconcile.expired",
    target: { table: "mpesa_stk_request", id: request.id },
    payload: { checkout_request_id: request.checkoutRequestId },
  });
}
