/** @bm/wallet — admin refund as a reversing ledger entry (P1-E03-S06).
 *
 * A refund is a NEW reversing `wallet_ledger` row — `kind='refund'`,
 * `reverses_entry_id` pointing at the original debit — NEVER a mutation or
 * delete of the original (the ledger is append-only, S01). The reversing entry
 * is signed opposite to the original (a debit of `-X` is refunded by a credit
 * of `+X`) so the net wallet effect is exactly the refunded portion returned.
 *
 * Partial refunds are supported: the remaining-refundable amount on an original
 * is `|original.amount|` minus the sum of all prior refunds that reverse it. A
 * refund may not exceed the remaining-refundable amount (AC4).
 *
 * Admin-only enforcement lives at the route layer (rbac `manage refund`), not
 * here — this primitive is auth-agnostic so it can be reused by jobs/back-office
 * flows. Loyalty proportional clawback is deferred to P3 (P3-E04); the new entry
 * is flagged `loyalty_clawback_pending=true` for that later job to pick up.
 *
 * Idempotent via `idempotencyKey`: a replay finds the existing refund row,
 * performs no further mutation, and returns `{ replayed: true }`.
 */
import type { Database } from "@bm/db";
import { audit, walletLedger } from "@bm/db";
import { and, eq, sql } from "drizzle-orm";
import type { Cents } from "./index.js";

/** Input to {@link refund}. */
export interface RefundInput {
  /** The original ledger entry (a debit) being reversed. */
  originalEntryId: string;
  /** Positive integer cents to refund (≤ remaining-refundable on the original). */
  amount: Cents;
  /** Required reason code (AC1). */
  reasonCode: string;
  /** Optional free-text note (AC1). */
  note?: string;
  /** Acting admin user id (the route guard has already proven the role). */
  postedBy: string;
  /** Caller dedup key; the server derives one from the original + amount if absent. */
  idempotencyKey?: string;
}

/** Result of a refund posting. */
export interface RefundResult {
  /** The reversing `wallet_ledger` entry id. */
  ledgerEntryId: string;
  /** The original entry this refund reverses. */
  originalEntryId: string;
  /** Cents refunded by this entry. */
  amount: Cents;
  /** Remaining-refundable cents on the original AFTER this refund. */
  remainingRefundable: Cents;
  /** True when this call was a no-op replay of a prior refund. */
  replayed: boolean;
}

/** Reason code missing/blank (AC1). */
export class RefundReasonRequiredError extends Error {
  constructor() {
    super("wallet.refund: a reason code is required");
    this.name = "RefundReasonRequiredError";
  }
}

/** The original entry to refund does not exist. */
export class RefundTargetNotFoundError extends Error {
  readonly originalEntryId: string;
  constructor(originalEntryId: string) {
    super(`wallet.refund: original entry ${originalEntryId} not found`);
    this.name = "RefundTargetNotFoundError";
    this.originalEntryId = originalEntryId;
  }
}

/** Refund amount exceeds what is still refundable on the original (AC1/AC4). */
export class RefundExceedsRefundableError extends Error {
  readonly requested: Cents;
  readonly remaining: Cents;
  constructor(requested: Cents, remaining: Cents) {
    super(
      `wallet.refund: refund of ${requested} exceeds remaining-refundable ${remaining}`,
    );
    this.name = "RefundExceedsRefundableError";
    this.requested = requested;
    this.remaining = remaining;
  }
}

/**
 * Post a reversing refund entry against an original debit. See the module doc
 * for the append-only / partial-refund / idempotency semantics. Returns the new
 * entry id plus the remaining-refundable amount after this refund.
 */
export async function refund(db: Database, input: RefundInput): Promise<RefundResult> {
  if (input.reasonCode.trim() === "") {
    throw new RefundReasonRequiredError();
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("wallet.refund: amount must be a positive integer (cents)");
  }

  const idempotencyKey =
    input.idempotencyKey ?? `refund:${input.originalEntryId}:${input.amount}`;

  return db.transaction(async (tx) => {
    // Idempotent replay: a prior refund posted under this exact key. Its effects
    // already committed → pure no-op (mirrors post()/applyTopup()).
    const [prior] = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, idempotencyKey));
    if (prior) {
      const already = await sumPriorRefunds(tx, input.originalEntryId);
      const [orig] = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.id, input.originalEntryId));
      const refundable = Math.abs(orig?.amount ?? 0);
      return {
        ledgerEntryId: prior.id,
        originalEntryId: input.originalEntryId,
        amount: Math.abs(prior.amount),
        remainingRefundable: refundable - already,
        replayed: true,
      };
    }

    const [original] = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, input.originalEntryId));
    if (!original) {
      throw new RefundTargetNotFoundError(input.originalEntryId);
    }

    // Remaining-refundable = |original| − Σ(prior refunds against it). Partial
    // refunds shrink this; the new refund may not exceed it (AC4).
    const refundableTotal = Math.abs(original.amount);
    const alreadyRefunded = await sumPriorRefunds(tx, input.originalEntryId);
    const remainingBefore = refundableTotal - alreadyRefunded;
    if (input.amount > remainingBefore) {
      throw new RefundExceedsRefundableError(input.amount, remainingBefore);
    }

    // The reversing entry is signed OPPOSITE the original so the net effect is
    // the refunded portion. A debit (negative) refunds as a credit (positive).
    const sign = original.amount < 0 ? 1 : -1;
    const reversingAmount = sign * input.amount;
    const direction: "credit" | "debit" = reversingAmount >= 0 ? "credit" : "debit";

    const [row] = await tx
      .insert(walletLedger)
      .values({
        walletId: original.walletId,
        amount: reversingAmount,
        direction,
        kind: "refund",
        idempotencyKey,
        source: "admin",
        postedBy: input.postedBy,
        reversesEntryId: original.id,
        // Loyalty clawback is deferred to P3 — flag it for the later job.
        loyaltyClawbackPending: true,
      })
      .returning();

    await audit(tx, {
      actor: input.postedBy,
      action: "wallet.refund",
      target: { table: "wallet_ledger", id: row!.id },
      payload: {
        original_entry_id: original.id,
        wallet_id: original.walletId,
        amount: input.amount,
        reason_code: input.reasonCode.trim(),
        note: input.note ?? null,
        remaining_refundable: remainingBefore - input.amount,
      },
    });

    return {
      ledgerEntryId: row!.id,
      originalEntryId: original.id,
      amount: input.amount,
      remainingRefundable: remainingBefore - input.amount,
      replayed: false,
    };
  });
}

/** Sum the magnitudes of all refund entries that reverse the given original. */
async function sumPriorRefunds(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  originalEntryId: string,
): Promise<Cents> {
  const [r] = await tx
    .select({ total: sql<string>`COALESCE(SUM(ABS(${walletLedger.amount})), 0)` })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.reversesEntryId, originalEntryId),
        eq(walletLedger.kind, "refund"),
      ),
    );
  return Number(r?.total ?? 0);
}
