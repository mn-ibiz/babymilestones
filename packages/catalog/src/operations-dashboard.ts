/**
 * P3-E05-S01 (Story 27.1) — Daily operations dashboard aggregation.
 *
 * One screen showing what is happening TODAY across every business unit. The
 * pure {@link aggregateOperationsDashboard} reducer turns the day's flat booking
 * rows (plus two pre-counted figures — in-progress sessions and the centre-wide
 * outstanding total) into the dashboard tiles (AC1):
 *
 *  - today's revenue: a grand total + a per-unit breakdown (every unit always
 *    listed, zero-filled, so the tile is stable across days),
 *  - bookings count today,
 *  - active sessions (passed straight through from the DB read),
 *  - outstanding balances total (passed straight through),
 *  - top staff today, ranked by attributed revenue.
 *
 * Definitions are kept consistent with the rest of reporting:
 *  - REVENUE is the booking's `staffRateSnapshot` — the service price written
 *    onto the booking + its invoice at book time — summed for every non-cancelled
 *    booking on the day, settled or pending (the same source the salon-report and
 *    staff-earnings surfaces read). The DB read filters out cancelled bookings.
 *  - A booking's UNIT is its service's `unit` (`play` | `talent` | `salon` |
 *    `coaching` | `event`). A booking whose service is missing/unknown falls into
 *    no unit bucket but still counts toward the headline bookings count + total.
 *  - TOP STAFF is the attributed-revenue ranking; unattributed bookings count
 *    toward revenue + the bookings count but never appear in the ranking.
 *
 * The DB read ({@link loadOperationsDashboardData} in `operations-dashboard-db.ts`)
 * stays a thin projection so this aggregation is exhaustively unit-tested with no
 * I/O — the same split the salon-report aggregation uses.
 */
import { SERVICE_UNITS, type ServiceUnit } from "./services.js";

/** One of the day's bookings, projected to exactly what the dashboard needs. */
export interface OperationsBookingRow {
  bookingId: string;
  /** The booking's service unit, or null when the service is unknown/missing. */
  unit: ServiceUnit | null;
  /** The booking's invoiced amount snapshot in integer KES cents. */
  revenueCents: number;
  /** Attributed staff id, or null when the booking carries no attribution. */
  staffId: string | null;
  /** Staff display-name (live name, falling back to the booking snapshot). */
  staffName: string;
}

/** The inputs the dashboard aggregation reduces — the DB read hands these in. */
export interface OperationsDashboardInput {
  /** The report date (`YYYY-MM-DD`). Echoed back on the result. */
  date: string;
  /** The day's non-cancelled bookings across all units. */
  bookings: readonly OperationsBookingRow[];
  /** In-progress check-ins (checked in, not yet checked out / completed). */
  activeSessions: number;
  /** Centre-wide outstanding balance (sum of open invoices) in integer cents. */
  outstandingCents: number;
}

/** Revenue for one unit (always present, zero-filled when the day had none). */
export interface UnitRevenue {
  unit: ServiceUnit;
  revenueCents: number;
}

/** Today's revenue tile: a grand total + the per-unit breakdown (AC1). */
export interface OperationsRevenue {
  totalCents: number;
  /** One row per unit, in {@link SERVICE_UNITS} order. Sums to {@link totalCents}. */
  byUnit: UnitRevenue[];
}

/** One staff member's slice of the day in the top-staff ranking (AC1). */
export interface OperationsTopStaff {
  staffId: string;
  staffName: string;
  /** Attributed non-cancelled bookings on the day. */
  bookings: number;
  /** Total attributed revenue (cents) for this staff member on the day. */
  revenueCents: number;
}

/** The fully-reduced daily-operations dashboard (AC1). */
export interface OperationsDashboard {
  date: string;
  revenue: OperationsRevenue;
  bookingsCount: number;
  activeSessions: number;
  outstandingCents: number;
  topStaff: OperationsTopStaff[];
}

export interface AggregateOperationsDashboardOpts {
  /** Cap on the top-staff ranking. Defaults to 5. */
  topStaffLimit?: number;
}

/** Default size of the top-staff ranking. */
const DEFAULT_TOP_STAFF_LIMIT = 5;

/**
 * Reduce the day's bookings + pre-counted figures to the dashboard tiles (AC1).
 * Pure — no I/O. The per-unit revenue is zero-filled across every unit so the
 * tile renders a stable list of units; the per-unit figures always sum to the
 * headline total. The top-staff ranking is by revenue desc, then name, then id,
 * and is capped (default 5).
 */
export function aggregateOperationsDashboard(
  inputData: OperationsDashboardInput,
  opts: AggregateOperationsDashboardOpts = {},
): OperationsDashboard {
  const topStaffLimit = opts.topStaffLimit ?? DEFAULT_TOP_STAFF_LIMIT;

  let totalCents = 0;
  const byUnit = new Map<ServiceUnit, number>(SERVICE_UNITS.map((u) => [u, 0]));
  const byStaff = new Map<string, OperationsTopStaff>();

  for (const b of inputData.bookings) {
    totalCents += b.revenueCents;
    if (b.unit !== null) {
      byUnit.set(b.unit, (byUnit.get(b.unit) ?? 0) + b.revenueCents);
    }
    if (b.staffId !== null) {
      let entry = byStaff.get(b.staffId);
      if (!entry) {
        entry = { staffId: b.staffId, staffName: b.staffName, bookings: 0, revenueCents: 0 };
        byStaff.set(b.staffId, entry);
      }
      entry.bookings += 1;
      entry.revenueCents += b.revenueCents;
    }
  }

  const topStaff = [...byStaff.values()]
    .sort(
      (a, b) =>
        b.revenueCents - a.revenueCents ||
        a.staffName.localeCompare(b.staffName) ||
        (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
    )
    .slice(0, topStaffLimit);

  return {
    date: inputData.date,
    revenue: {
      totalCents,
      byUnit: SERVICE_UNITS.map((unit) => ({ unit, revenueCents: byUnit.get(unit) ?? 0 })),
    },
    bookingsCount: inputData.bookings.length,
    activeSessions: inputData.activeSessions,
    outstandingCents: inputData.outstandingCents,
    topStaff,
  };
}
