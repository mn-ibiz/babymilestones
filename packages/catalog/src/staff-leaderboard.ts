/**
 * P3-E05-S03 (Story 27.3) — Top-staff leaderboard aggregation.
 *
 * "Who is bringing in the most revenue this period." Builds directly on 27.1's
 * attributed-revenue idea ({@link aggregateOperationsDashboard}: REVENUE is the
 * booking's `staffRateSnapshot` summed per attributed staff) and extends it from
 * "today" to an arbitrary `[from, to]` range with two extra per-staff metrics
 * (AC1):
 *
 *  - REVENUE: total attributed `staffRateSnapshot` over the period (non-cancelled
 *    bookings — the DB read filters out cancelled, the same source 27.1 / 27.2 /
 *    staff-earnings read),
 *  - SERVICE COUNT: number of attributed non-cancelled bookings (one booking =
 *    one service performed),
 *  - AVERAGE TICKET: revenue ÷ service count, truncated to whole integer cents.
 *    A staff member with zero services has an average ticket of 0 (never a
 *    divide-by-zero / NaN).
 *
 * The aggregation is handed the FULL roster of staff IN SCOPE (already
 * role-filtered by the DB read for AC2) so a staff member with zero services in
 * the period still appears in the table with zeroes. A booking attributed to a
 * staff id NOT in the roster is ignored (it belongs to an out-of-scope role).
 * The ranking is revenue desc, then name, then id — the same deterministic
 * tie-break 27.1 uses.
 *
 * The per-staff drill-down (AC3) REUSES the commission ledger as the single
 * source of truth: {@link aggregateStaffCommission} nets the staff member's
 * commission-ledger lines (`source='booking'` accruals minus `refund_reversal`
 * reversals) over the period — the SAME net-per-staff math the commission run /
 * staff-earnings surfaces use. The DB read fetches the lines; this is pure.
 *
 * Everything is integer cents. Pure — no I/O — so it is exhaustively unit-tested,
 * the same split 27.1 / 27.2 use.
 */
import type { AttributionRole } from "@bm/db";

/** One staff member in scope for the leaderboard (already role-filtered). */
export interface LeaderboardStaffRow {
  staffId: string;
  /** Live display name (the DB read resolves it off the staff record). */
  staffName: string;
  role: AttributionRole;
}

/** One attributed, non-cancelled booking in the period, projected to the metrics. */
export interface LeaderboardBookingRow {
  /** The attributed staff id (the DB read excludes unattributed bookings). */
  staffId: string;
  /** The booking's invoiced amount snapshot in integer KES cents. */
  revenueCents: number;
}

/** The inputs the leaderboard aggregation reduces — the DB read hands these in. */
export interface StaffLeaderboardInput {
  /** Inclusive range start (`YYYY-MM-DD`). Echoed back on the result. */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). Echoed back on the result. */
  to: string;
  /** Every staff member in scope (already role-filtered, AC2). */
  staff: readonly LeaderboardStaffRow[];
  /** The period's attributed, non-cancelled bookings. */
  bookings: readonly LeaderboardBookingRow[];
}

/** One staff member's slice of the leaderboard (AC1). */
export interface StaffLeaderboardRow {
  staffId: string;
  staffName: string;
  role: AttributionRole;
  /** Total attributed revenue (cents) over the period. */
  revenueCents: number;
  /** Count of services performed (attributed non-cancelled bookings). */
  serviceCount: number;
  /** Average ticket = revenue ÷ service count, integer cents; 0 when no services. */
  avgTicketCents: number;
}

/** The fully-reduced top-staff leaderboard (AC1/AC2). */
export interface StaffLeaderboard {
  from: string;
  to: string;
  /** Per-staff rows, ranked by revenue desc, then name, then id. */
  rows: StaffLeaderboardRow[];
}

/**
 * Reduce the period's attributed bookings + in-scope roster to the per-staff
 * leaderboard (AC1/AC2). Pure — no I/O. Every roster staff member appears (zero-
 * filled when they performed no services this period); a booking attributed to a
 * staff id not in the roster is ignored (out of the selected role). Average ticket
 * is revenue ÷ service count, truncated to integer cents, and is 0 — never NaN —
 * when the staff member performed no services. The ranking is revenue desc, then
 * name, then id (the 27.1 tie-break).
 */
export function aggregateStaffLeaderboard(inputData: StaffLeaderboardInput): StaffLeaderboard {
  // Seed every in-scope staff member at zero so they always appear (AC1).
  const byStaff = new Map<string, { revenueCents: number; serviceCount: number }>();
  const meta = new Map<string, LeaderboardStaffRow>();
  for (const s of inputData.staff) {
    byStaff.set(s.staffId, { revenueCents: 0, serviceCount: 0 });
    meta.set(s.staffId, s);
  }

  for (const b of inputData.bookings) {
    const entry = byStaff.get(b.staffId);
    if (!entry) continue; // attributed to an out-of-scope (role-filtered) staff id
    entry.revenueCents += b.revenueCents;
    entry.serviceCount += 1;
  }

  const rows: StaffLeaderboardRow[] = [...byStaff.entries()].map(([staffId, agg]) => {
    const m = meta.get(staffId)!;
    return {
      staffId,
      staffName: m.staffName,
      role: m.role,
      revenueCents: agg.revenueCents,
      serviceCount: agg.serviceCount,
      // Divide-by-zero safe: no services → average ticket of 0 (AC1).
      avgTicketCents: agg.serviceCount === 0 ? 0 : Math.trunc(agg.revenueCents / agg.serviceCount),
    };
  });

  rows.sort(
    (a, b) =>
      b.revenueCents - a.revenueCents ||
      a.staffName.localeCompare(b.staffName) ||
      (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
  );

  return { from: inputData.from, to: inputData.to, rows };
}

/** One commission-ledger line for a staff member, projected to the drill-down math. */
export interface CommissionLedgerLine {
  /** Signed integer cents: positive accrual, negative reversal. */
  amountCents: number;
  /** `'booking'` (accrual) | `'refund_reversal'` (reversal). */
  source: string;
}

/** A staff member's commission totals over the period (drill-down, AC3). */
export interface StaffCommissionTotals {
  /** Net commission cents (accruals minus reversals). */
  netCents: number;
  /** Sum of positive accruals (`source='booking'`). */
  accruedCents: number;
  /** Magnitude of reversals (always positive). */
  reversedCents: number;
  /** Number of ledger lines in the period. */
  entryCount: number;
}

/**
 * Net a staff member's commission-ledger lines over the period (AC3). REUSES the
 * commission ledger as the single source of truth — the SAME net (accruals minus
 * reversals) the commission run / staff-earnings surfaces compute. Pure — the DB
 * read fetches the period's lines for one staff member; this only sums them.
 */
export function aggregateStaffCommission(
  lines: readonly CommissionLedgerLine[],
): StaffCommissionTotals {
  let netCents = 0;
  let accruedCents = 0;
  let reversedCents = 0;
  for (const l of lines) {
    netCents += l.amountCents;
    if (l.amountCents >= 0) accruedCents += l.amountCents;
    else reversedCents += -l.amountCents;
  }
  return { netCents, accruedCents, reversedCents, entryCount: lines.length };
}
