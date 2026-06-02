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

export interface ReassignBookingCommissionResult {
  /** True when a settled accrual was actually moved old → new (AC4). */
  moved: boolean;
  /** Why no move happened (when `moved` is false). */
  skipped?: "not_settled" | "no_target_rate";
  /** True when this call replayed an already-completed move (no-op). */
  replayed: boolean;
  /** The signed-opposite reversal posted against the old stylist's accrual. */
  reversal: CommissionLedgerRow | null;
  /** The fresh `reassign` line posted to the new (current) stylist. */
  posted: CommissionLedgerRow | null;
}

/**
 * Move a SETTLED salon booking's commission from the old stylist to the booking's
 * CURRENT (new) stylist after a reassign (Story 25.4 AC4). Assumes the caller has
 * ALREADY updated `bookings.staffId` to the new stylist (the catalog
 * `reassignSalonBooking` does this).
 *
 *  - If the booking has no `source='booking'` accrual yet, it never settled — this
 *    is a NO-OP (`skipped:'not_settled'`). Future accrual lands on the new stylist
 *    via {@link recordBookingCommission} using the now-current attribution.
 *  - Otherwise: REVERSE the old stylist's accrual with a signed-opposite
 *    `refund_reversal` row (reusing the exact ledger semantics of
 *    {@link reverseBookingCommission} — append-only, never mutating the original),
 *    then POST a fresh positive line to the new stylist as `source='reassign'`
 *    (outside the `one_accrual_per_booking` partial unique index, so it never
 *    collides), at the NEW stylist's rate in force at booking time. Net to the old
 *    stylist becomes zero; the new stylist nets their commission.
 *
 * Idempotent: a replay finds the reversal + reassign line already present and is a
 * no-op (`moved:false, replayed:true`). `fromStaffId` identifies the old accrual
 * to reverse; the new stylist is read from the (already-updated) booking row.
 */
export async function reassignBookingCommission(
  db: CommissionExecutor,
  input: { bookingId: string; fromStaffId: string | null; postedBy?: string | null; occurredAt?: Date },
): Promise<ReassignBookingCommissionResult> {
  const run = async (tx: CommissionExecutor): Promise<ReassignBookingCommissionResult> => {
    // The original accrual. No accrual ⇒ not settled ⇒ nothing to move.
    const [accrual] = await tx
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.bookingId, input.bookingId), eq(commissionLedger.source, "booking")));
    if (!accrual) {
      return { moved: false, skipped: "not_settled", replayed: false, reversal: null, posted: null };
    }

    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId));
    const newStaffId = booking?.staffId ?? null;

    // Idempotency keyed on the SPECIFIC transition, not "any reassign line exists":
    // compute the booking's CURRENT net commission by staff straight from the
    // ledger. A move A→B→A or A→B→C is a sequence of distinct transitions — each
    // must apply exactly once — whereas repeating the SAME final state is a no-op.
    const ledgerRows = await tx
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.bookingId, input.bookingId));
    const netByStaff = new Map<string, number>();
    // The most recent net-positive-contributing row per staff, to anchor a reversal.
    const lastPositiveRow = new Map<string, CommissionLedgerRow>();
    for (const r of ledgerRows) {
      netByStaff.set(r.staffId, (netByStaff.get(r.staffId) ?? 0) + r.amountCents);
      if (r.amountCents > 0) lastPositiveRow.set(r.staffId, r);
    }

    // Staff (other than the current/target) who still hold a net-positive
    // commission for this booking — these are the prior stylist(s) to reverse.
    const priorHolders = [...netByStaff.entries()].filter(
      ([staffId, net]) => net > 0 && staffId !== newStaffId,
    );

    // True replay: the net is already entirely on the current/target stylist (no
    // other staff holds a positive net) → nothing to move.
    if (priorHolders.length === 0) {
      const priorPost = newStaffId
        ? ledgerRows.find((r) => r.source === "reassign" && r.staffId === newStaffId) ?? null
        : null;
      const priorReversal =
        ledgerRows.find((r) => r.reversesEntryId === accrual.id && r.source === "refund_reversal") ?? null;
      return { moved: false, replayed: true, reversal: priorReversal, posted: priorPost };
    }

    const occurredAt = input.occurredAt ?? new Date();

    // 1) Reverse each prior stylist's net-positive commission with a signed-opposite,
    //    append-only `refund_reversal` row anchored to their latest positive line
    //    (AC4) — net to each prior stylist becomes zero.
    let lastReversal: CommissionLedgerRow | null = null;
    for (const [priorStaffId, net] of priorHolders) {
      const anchor = lastPositiveRow.get(priorStaffId)!;
      const [reversed] = await tx
        .insert(commissionLedger)
        .values({
          staffId: priorStaffId,
          bookingId: input.bookingId,
          amountCents: -net, // zero out the prior stylist's net
          rateSnapshot: anchor.rateSnapshot,
          source: "refund_reversal",
          reversesEntryId: anchor.id,
          occurredAt,
        })
        .returning();
      await audit(tx, {
        actor: input.postedBy ?? null,
        action: "commission.ledger.reversed",
        target: { table: "commission_ledger", id: reversed!.id },
        payload: { booking_id: input.bookingId, reverses_entry_id: anchor.id, amount_cents: -net },
      });
      lastReversal = reversed!;
    }

    // 2) Post the new (now-current) stylist's commission as a distinct 'reassign'
    //    line at THEIR rate in force at booking time. No rate ⇒ nothing to post.
    if (!newStaffId || !booking) {
      return { moved: true, replayed: false, reversal: lastReversal, posted: null };
    }
    const rate = await resolveRateAt(tx, newStaffId, booking.createdAt);
    if (!rate) {
      return { moved: true, skipped: "no_target_rate", replayed: false, reversal: lastReversal, posted: null };
    }
    const amountCents = commissionCents(booking.staffRateSnapshot, rate.ratePercent);
    const [posted] = await tx
      .insert(commissionLedger)
      .values({
        staffId: newStaffId,
        bookingId: booking.id,
        amountCents,
        rateSnapshot: rate.ratePercent,
        source: "reassign",
        reversesEntryId: null,
        occurredAt,
      })
      .returning();
    await audit(tx, {
      actor: input.postedBy ?? null,
      action: "commission.ledger.posted",
      target: { table: "commission_ledger", id: posted!.id },
      payload: {
        booking_id: booking.id,
        staff_id: newStaffId,
        amount_cents: amountCents,
        rate_snapshot: rate.ratePercent,
        source: "reassign",
        reverses_staff_id: input.fromStaffId,
      },
    });

    return { moved: true, replayed: false, reversal: lastReversal, posted: posted! };
  };

  return "transaction" in db ? db.transaction(run) : run(db);
}
