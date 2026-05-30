/** @bm/wallet — loyalty redemption engine (P2-E05-S03). Redeeming points credits
 *  the wallet (KES = points × redeem_rate) and writes a loyalty_ledger debit, in
 *  ONE transaction, idempotently. Cannot redeem more than the current balance
 *  (no negative loyalty balance) and cannot double-spend (idempotency key +
 *  in-transaction balance recheck). Integer-cents only — no float drift. */
import type { Database } from "@bm/db";
import { audit, loyaltyLedger, walletLedger } from "@bm/db";
import { eq } from "drizzle-orm";
import { assertPositivePoints, getLoyaltyBalance } from "./loyalty.js";
import { getEffectiveRates, kesForPoints } from "./loyalty-rates.js";

/** Thrown when a redemption would exceed the available points balance (AC3). */
export class InsufficientPointsError extends Error {
  readonly available: number;
  readonly requested: number;
  constructor(available: number, requested: number) {
    super(
      `cannot redeem ${requested} points: only ${available} available`,
    );
    this.name = "InsufficientPointsError";
    this.available = available;
    this.requested = requested;
  }
}

export interface RedeemPointsInput {
  walletId: string;
  /** Strictly-positive integer points to redeem. */
  points: number;
  /** Dedup key; a retried redeem with this key is a no-op (no double-spend). */
  idempotencyKey: string;
  /** Acting parent/user id (UUID) for the audit row + wallet posting. */
  actor: string;
  /**
   * Redeem rate (KES per point) to use. Defaults to the effective rate now. The
   * rate used is snapshotted onto the loyalty_ledger row (AC: survives changes).
   */
  redeemRate?: number;
  sourceType?: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RedeemPointsResult {
  redeemedPoints: number;
  /** Cash value credited to the wallet (integer cents). */
  discountCents: number;
  /** New loyalty points balance after the redemption. */
  balance: number;
  /** The loyalty_ledger debit row id. */
  loyaltyEntryId: string;
  /** The wallet_ledger credit row id. */
  walletEntryId: string;
}

/**
 * Redeem loyalty points for wallet credit (P2-E05-S03). Atomic + idempotent:
 *
 * 1. If a loyalty_ledger row already exists for `idempotencyKey`, returns it
 *    (no double-spend, no second wallet credit).
 * 2. Re-reads the balance INSIDE the transaction; throws
 *    {@link InsufficientPointsError} if `points` exceeds it (AC3 — cannot redeem
 *    more than the balance; a concurrent racing redeem either fails this check
 *    or loses the unique-key race below).
 * 3. Credits the wallet by `points × redeemRate` (AC2/AC4 — wallet_ledger
 *    credit) and writes the loyalty_ledger debit referencing that entry.
 * 4. Audits `loyalty.redeem`.
 *
 * The booking debit is unaffected — it still debits the wallet normally (AC4);
 * redemption only tops the wallet up first.
 */
export async function redeemPoints(
  db: Database,
  input: RedeemPointsInput,
): Promise<RedeemPointsResult> {
  assertPositivePoints(input.points);

  return db.transaction(async (tx) => {
    // (1) Idempotency: a prior redeem with this key short-circuits.
    const [existing] = await tx
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      const balance = await getLoyaltyBalance(tx, input.walletId);
      const rate = existing.rateSnapshot;
      return {
        redeemedPoints: existing.points,
        discountCents: kesForPoints(existing.points, rate),
        balance,
        loyaltyEntryId: existing.id,
        walletEntryId: existing.walletLedgerEntryId ?? "",
      };
    }

    // (2) Double-spend guard: re-check the balance inside the transaction.
    const balanceBefore = await getLoyaltyBalance(tx, input.walletId);
    if (input.points > balanceBefore) {
      throw new InsufficientPointsError(balanceBefore, input.points);
    }

    // (3) Resolve the redeem rate (snapshot) + compute the cash credit.
    const redeemRate =
      input.redeemRate ?? (await getEffectiveRates(tx)).redeemRate;
    const discountCents = kesForPoints(input.points, redeemRate);

    // Credit the wallet (mirrors @bm/wallet `post` so it stays in our tx). The
    // unique idempotency_key keeps the wallet layer safe under concurrent retry.
    const walletKey = `loyalty-redeem:${input.idempotencyKey}`;
    const [walletRow] = await tx
      .insert(walletLedger)
      .values({
        walletId: input.walletId,
        amount: discountCents, // positive = credit
        direction: "credit",
        kind: "adjustment",
        idempotencyKey: walletKey,
        postedBy: input.actor,
        source: "loyalty",
      })
      .returning();

    // Write the loyalty_ledger debit referencing the wallet credit entry.
    const [loyaltyRow] = await tx
      .insert(loyaltyLedger)
      .values({
        walletId: input.walletId,
        direction: "redeem",
        points: input.points,
        rateSnapshot: redeemRate,
        walletLedgerEntryId: walletRow!.id,
        sourceType: input.sourceType ?? "redemption",
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      })
      .returning();

    // (4) Audit the redemption.
    await audit(tx, {
      actor: input.actor,
      action: "loyalty.redeem",
      target: { table: "loyalty_ledger", id: loyaltyRow!.id },
      payload: {
        wallet_id: input.walletId,
        points: input.points,
        redeem_rate: redeemRate,
        discount_cents: discountCents,
        wallet_ledger_entry_id: walletRow!.id,
      },
    });

    return {
      redeemedPoints: input.points,
      discountCents,
      balance: balanceBefore - input.points,
      loyaltyEntryId: loyaltyRow!.id,
      walletEntryId: walletRow!.id,
    };
  });
}
