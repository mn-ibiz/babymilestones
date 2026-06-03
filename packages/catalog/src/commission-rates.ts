import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { staff, staffCommissionRates, type StaffCommissionRateRow } from "@bm/db";
import type { Executor } from "./staff.js";

/**
 * Per-staff commission rate with effective dating (P3-E01-S01). A rate is valid
 * over the HALF-OPEN interval `[effectiveFrom, effectiveTo)`. The rate in force
 * for a booking is the row whose `effectiveFrom <= booking.createdAt` and
 * (`effectiveTo` is null OR `booking.createdAt < effectiveTo`) — see
 * {@link resolveRateAt}. Setting a new rate auto-closes the previous open one
 * atomically ({@link setCommissionRate}). The db carries a partial unique index
 * (one open rate per staff) as a concurrency backstop.
 *
 * `ratePercent` is a decimal-string percentage ("12.50" = 12.5%) — drizzle
 * returns numeric columns as strings to preserve precision. The commission
 * AMOUNT this drives is always computed in integer cents (P3-E01-S02), never a
 * float, so the ledger never drifts.
 */

export interface SetCommissionRateInput {
  staffId: string;
  /** Decimal percentage as string or number; stored as numeric(5,2). */
  ratePercent: string | number;
  /** Instant the new rate takes effect (inclusive). */
  effectiveFrom: Date;
  /** Optional reason recorded on the row. */
  reason?: string | null;
}

/** Normalise a rate input to the canonical 2-decimal string numeric stores. */
function toRateString(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) throw new Error("ratePercent must be a finite number");
  if (n < 0 || n > 100) throw new Error("ratePercent must be between 0 and 100");
  return n.toFixed(2);
}

/**
 * Set a staff member's commission rate effective from a given instant (AC2).
 * Auto-closes the previous open rate by stamping its `effectiveTo` to the new
 * `effectiveFrom`, in ONE transaction so there is never an overlap or gap.
 *
 * Edge case: a correction effective at the SAME instant as the current open rate
 * would otherwise produce a zero-width [from, from) interval (rejected by the db
 * CHECK). Instead we REPLACE the open rate in place — the common "I typed the
 * wrong number" correction — keeping the same row id. Setting a rate effective
 * BEFORE the current open rate's start is rejected (would create an overlap).
 *
 * Returns the now-open rate row.
 */
export async function setCommissionRate(
  db: Executor,
  input: SetCommissionRateInput,
): Promise<StaffCommissionRateRow> {
  const ratePercent = toRateString(input.ratePercent);
  const effectiveFrom = input.effectiveFrom;
  const reason = input.reason ?? null;

  const apply = async (tx: Executor): Promise<StaffCommissionRateRow> => {
    // Serialise concurrent rate changes for this staff by locking the parent staff
    // row first (mirrors setServicePrice/setPlanPrice). The partial unique index is
    // the durable backstop; the lock avoids a raw unique-violation surfacing as a
    // confusing 400 on a race, and serialises even the first (no open row) insert.
    const [lockedStaff] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.id, input.staffId))
      .for("update");
    if (!lockedStaff) {
      throw new Error(`setCommissionRate: staff ${input.staffId} not found`);
    }
    const [open] = await tx
      .select()
      .from(staffCommissionRates)
      .where(and(eq(staffCommissionRates.staffId, input.staffId), isNull(staffCommissionRates.effectiveTo)));

    if (open) {
      if (effectiveFrom.getTime() < open.effectiveFrom.getTime()) {
        throw new Error("new rate effective_from must be >= the current open rate's effective_from");
      }
      if (effectiveFrom.getTime() === open.effectiveFrom.getTime()) {
        // Same-instant correction: replace the open rate in place (no zero-width interval).
        const [replaced] = await tx
          .update(staffCommissionRates)
          .set({ ratePercent, reason })
          .where(eq(staffCommissionRates.id, open.id))
          .returning();
        return replaced!;
      }
      // Auto-close the previous open rate at the new from (half-open boundary).
      await tx
        .update(staffCommissionRates)
        .set({ effectiveTo: effectiveFrom })
        .where(eq(staffCommissionRates.id, open.id));
    }

    const [created] = await tx
      .insert(staffCommissionRates)
      .values({ staffId: input.staffId, ratePercent, effectiveFrom, effectiveTo: null, reason })
      .returning();
    return created!;
  };

  // Run atomically. `Executor` may already be a transaction handle; drizzle
  // supports nested `.transaction` (savepoint) so this is safe either way.
  return db.transaction(apply);
}

/**
 * Resolve the commission rate in force for a staff member at an instant (AC3).
 * Half-open interval: `effectiveFrom <= at` AND (`effectiveTo` is null OR
 * `at < effectiveTo`). Returns the matching row, or null when none applies.
 *
 * Implementation: pick the latest row with `effectiveFrom <= at`; it is the
 * applicable one because intervals are contiguous + non-overlapping. Then verify
 * its (exclusive) end still contains `at` — defensive against any gap.
 */
export async function resolveRateAt(
  db: Executor,
  staffId: string,
  at: Date,
): Promise<StaffCommissionRateRow | null> {
  const [row] = await db
    .select()
    .from(staffCommissionRates)
    .where(and(eq(staffCommissionRates.staffId, staffId), lte(staffCommissionRates.effectiveFrom, at)))
    .orderBy(desc(staffCommissionRates.effectiveFrom))
    .limit(1);
  if (!row) return null;
  if (row.effectiveTo !== null && at.getTime() >= row.effectiveTo.getTime()) return null;
  return row;
}

/** The currently-open rate for a staff member (effective_to null), or null. */
export async function getOpenCommissionRate(
  db: Executor,
  staffId: string,
): Promise<StaffCommissionRateRow | null> {
  const [row] = await db
    .select()
    .from(staffCommissionRates)
    .where(and(eq(staffCommissionRates.staffId, staffId), isNull(staffCommissionRates.effectiveTo)));
  return row ?? null;
}

/** A staff member's full rate history, newest-first. */
export async function listCommissionRates(
  db: Executor,
  staffId: string,
): Promise<StaffCommissionRateRow[]> {
  return db
    .select()
    .from(staffCommissionRates)
    .where(eq(staffCommissionRates.staffId, staffId))
    .orderBy(desc(staffCommissionRates.effectiveFrom));
}

/**
 * Compute a commission amount in INTEGER cents from a base amount (cents) and a
 * decimal-string rate percentage. Pure + exact: avoids float drift by doing the
 * multiply in integers (hundredths-of-a-percent) before a single half-up round
 * to whole cents. Exported for P3-E01-S02 + unit testing.
 */
export function commissionCents(baseCents: number, ratePercent: string | number): number {
  if (!Number.isInteger(baseCents)) throw new Error("baseCents must be an integer");
  const n = typeof ratePercent === "string" ? Number(ratePercent) : ratePercent;
  if (!Number.isFinite(n)) throw new Error("ratePercent must be finite");
  // Parse the rate to hundredths of a percent: "12.50" → 1250.
  const rateHundredths = Math.round(n * 100);
  // commission = baseCents * rate% = baseCents * (rateHundredths / 10000).
  const numerator = baseCents * rateHundredths; // integer
  return Math.round(numerator / 10000); // half-up to whole cents
}
