import type { Database, Transaction } from "@bm/db";
import { audit, bookings, commissionLedger } from "@bm/db";
import { and, eq } from "drizzle-orm";
import { commissionCents, resolveRateAt } from "@bm/catalog";
import type { CommissionLedgerRow } from "@bm/db";

/**
 * Commission hook (P3-E01-S02). Hooks into booking settle (wallet debit on
 * check-in OR subscription consumption): when a settled booking is attributed
 * (`staffId` non-null), write ONE append-only commission accrual row —
 * commission = the booking's service-price snapshot (`staffRateSnapshot`, integer
 * cents) × the staff commission rate in force at `booking.createdAt`, computed in
 * INTEGER cents (AC1/AC3). A refund reverses it with a signed-opposite reversing
 * row (AC2). The ledger is append-only (AC4) — reversals are new rows.
 *
 * Idempotent (AC4 / re-run safe): at most one accrual per booking. A replay finds
 * the existing accrual and is a pure no-op. Safe to call from inside the caller's
 * settle transaction or standalone.
 */

export type CommissionExecutor = Database | Transaction;

export interface RecordBookingCommissionResult {
  /** The accrual row (existing on a replay), or null when the booking is unattributed / has no rate. */
  entry: CommissionLedgerRow | null;
  /** Why no entry was written, when `entry` is null. */
  skipped?: "unattributed" | "no_rate" | "not_found";
  /** True when this call replayed an already-recorded accrual (no-op). */
  replayed: boolean;
}

/**
 * Record the commission accrual for a settled booking (AC1/AC3). No-op + returns
 * `skipped` when the booking is unattributed, unknown, or the staff member has no
 * commission rate in force at booking time. Idempotent on `bookingId`.
 *
 * `postedBy` is the acting user (the audit actor); pass null for system flows
 * (e.g. the subscription-renewal job consuming an entitlement).
 */
export async function recordBookingCommission(
  db: CommissionExecutor,
  input: { bookingId: string; postedBy?: string | null; occurredAt?: Date },
): Promise<RecordBookingCommissionResult> {
  const run = async (tx: CommissionExecutor): Promise<RecordBookingCommissionResult> => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId));
    if (!booking) return { entry: null, skipped: "not_found", replayed: false };
    if (!booking.staffId) return { entry: null, skipped: "unattributed", replayed: false };

    // Idempotent: an accrual already exists for this booking → no-op.
    const [existing] = await tx
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.bookingId, input.bookingId), eq(commissionLedger.source, "booking")));
    if (existing) return { entry: existing, replayed: true };

    // The rate in force at booking time (half-open interval, P3-E01-S01 AC3).
    const rate = await resolveRateAt(tx, booking.staffId, booking.createdAt);
    if (!rate) return { entry: null, skipped: "no_rate", replayed: false };

    // commission = service price snapshot (integer cents) × rate% → integer cents.
    const amountCents = commissionCents(booking.staffRateSnapshot, rate.ratePercent);
    const occurredAt = input.occurredAt ?? new Date();

    const [entry] = await tx
      .insert(commissionLedger)
      .values({
        staffId: booking.staffId,
        bookingId: booking.id,
        amountCents,
        rateSnapshot: rate.ratePercent,
        source: "booking",
        reversesEntryId: null,
        occurredAt,
      })
      // Concurrency backstop: a racing settle that already inserted the accrual
      // wins; this insert no-ops on the partial unique index.
      .onConflictDoNothing()
      .returning();

    if (!entry) {
      // Lost the race — fetch the winner so the result is consistent.
      const [winner] = await tx
        .select()
        .from(commissionLedger)
        .where(and(eq(commissionLedger.bookingId, input.bookingId), eq(commissionLedger.source, "booking")));
      return { entry: winner ?? null, replayed: true };
    }

    await audit(tx, {
      actor: input.postedBy ?? null,
      action: "commission.ledger.posted",
      target: { table: "commission_ledger", id: entry.id },
      payload: { booking_id: booking.id, staff_id: booking.staffId, amount_cents: amountCents, rate_snapshot: rate.ratePercent },
    });
    return { entry, replayed: false };
  };

  return "transaction" in db ? db.transaction(run) : run(db);
}

export interface ReverseBookingCommissionResult {
  /** The reversing row, or null when there was nothing to reverse / already reversed. */
  entry: CommissionLedgerRow | null;
  /** Why no reversal was written. */
  skipped?: "no_accrual" | "already_reversed";
  replayed: boolean;
}

/**
 * Reverse a booking's commission on refund (AC2). Inserts a NEW signed-opposite
 * reversing row (`source='refund_reversal'`) pointing at the original accrual —
 * never mutating it (AC4). Idempotent: if a reversal already exists for the
 * accrual, it is a no-op. No-op when there is no accrual to reverse.
 */
export async function reverseBookingCommission(
  db: CommissionExecutor,
  input: { bookingId: string; postedBy?: string | null; occurredAt?: Date },
): Promise<ReverseBookingCommissionResult> {
  const run = async (tx: CommissionExecutor): Promise<ReverseBookingCommissionResult> => {
    const [accrual] = await tx
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.bookingId, input.bookingId), eq(commissionLedger.source, "booking")));
    if (!accrual) return { entry: null, skipped: "no_accrual", replayed: false };

    const [priorReversal] = await tx
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.reversesEntryId, accrual.id), eq(commissionLedger.source, "refund_reversal")));
    if (priorReversal) return { entry: priorReversal, skipped: "already_reversed", replayed: true };

    const occurredAt = input.occurredAt ?? new Date();
    const [entry] = await tx
      .insert(commissionLedger)
      .values({
        staffId: accrual.staffId,
        bookingId: accrual.bookingId,
        amountCents: -accrual.amountCents, // signed-opposite reversal
        rateSnapshot: accrual.rateSnapshot,
        source: "refund_reversal",
        reversesEntryId: accrual.id,
        occurredAt,
      })
      .returning();

    await audit(tx, {
      actor: input.postedBy ?? null,
      action: "commission.ledger.reversed",
      target: { table: "commission_ledger", id: entry!.id },
      payload: { booking_id: accrual.bookingId, reverses_entry_id: accrual.id, amount_cents: -accrual.amountCents },
    });
    return { entry: entry!, replayed: false };
  };

  return "transaction" in db ? db.transaction(run) : run(db);
}
