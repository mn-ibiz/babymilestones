import { and, eq, gte, lt, ne } from "drizzle-orm";
import { bookings, commissionLedger, staff, type AttributionRole } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateStaffCommission,
  aggregateStaffLeaderboard,
  type CommissionLedgerLine,
  type LeaderboardBookingRow,
  type LeaderboardStaffRow,
  type StaffCommissionTotals,
  type StaffLeaderboard,
} from "./staff-leaderboard.js";

/**
 * P3-E05-S03 (Story 27.3) — DB reads behind the top-staff leaderboard. Two thin
 * projections that delegate all arithmetic to the pure aggregations:
 *
 *  - {@link loadStaffLeaderboard}: the in-scope staff roster (optionally filtered
 *    by `role`, AC2) PLUS the period's attributed, non-cancelled bookings, handed
 *    to {@link aggregateStaffLeaderboard} for per-staff revenue / service-count /
 *    average-ticket (AC1). Every roster staff member appears even with zero
 *    services; bookings attributed to out-of-scope staff are dropped by the
 *    aggregation.
 *  - {@link loadStaffCommissionDrilldown}: one staff member's commission-ledger
 *    lines over the period, netted by {@link aggregateStaffCommission} — the SAME
 *    commission source the run / staff-earnings surfaces use (AC3). Returns null
 *    for an unknown staff id.
 *
 * Read-only — not audited. Boundaries are UTC `[from 00:00, (to+1) 00:00)` — the
 * inclusive calendar range `[from, to]` — keyed on the booking's `checkedInAt`
 * (the same field 27.1 / 27.2 key on) and the ledger line's `occurredAt` (the
 * period attribution the commission run uses).
 */
export interface LoadStaffLeaderboardOpts {
  /** Inclusive range start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). */
  to: string;
  /** Optional role filter (stylist / instructor / attendant / …) (AC2). */
  role?: AttributionRole;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` → the UTC start of the NEXT calendar day (exclusive upper bound). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + DAY_MS);
}

/**
 * Load the top-staff leaderboard for an inclusive `[from, to]` range (AC1/AC2).
 * Loads the in-scope staff roster (optionally role-filtered) + the period's
 * attributed non-cancelled bookings, then delegates to the pure
 * {@link aggregateStaffLeaderboard}. Read-only.
 */
export async function loadStaffLeaderboard(
  db: Executor,
  opts: LoadStaffLeaderboardOpts,
): Promise<StaffLeaderboard> {
  const rangeStart = dayStart(opts.from);
  const rangeEnd = nextDayStart(opts.to);

  // The in-scope staff roster (role-filtered for AC2). Every member appears even
  // with zero services this period, so the table is stable.
  const roster = await db
    .select({ staffId: staff.id, staffName: staff.displayName, role: staff.role })
    .from(staff)
    .where(opts.role ? eq(staff.role, opts.role) : undefined);

  const rosterOut: LeaderboardStaffRow[] = roster.map((s) => ({
    staffId: s.staffId,
    staffName: s.staffName,
    role: s.role,
  }));

  // The period's attributed, non-cancelled bookings (keyed on checkedInAt).
  const bookingRows = await db
    .select({ staffId: bookings.staffId, revenueCents: bookings.staffRateSnapshot })
    .from(bookings)
    .where(
      and(
        gte(bookings.checkedInAt, rangeStart),
        lt(bookings.checkedInAt, rangeEnd),
        ne(bookings.status, "cancelled"),
      ),
    );

  const bookingsOut: LeaderboardBookingRow[] = bookingRows
    .filter((b): b is { staffId: string; revenueCents: number } => b.staffId !== null)
    .map((b) => ({ staffId: b.staffId, revenueCents: b.revenueCents }));

  return aggregateStaffLeaderboard({
    from: opts.from,
    to: opts.to,
    staff: rosterOut,
    bookings: bookingsOut,
  });
}

export interface LoadStaffCommissionDrilldownOpts {
  staffId: string;
  /** Inclusive range start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). */
  to: string;
}

/** One staff member's commission drill-down over the period (AC3). */
export interface StaffCommissionDrilldown {
  staffId: string;
  staffName: string;
  role: AttributionRole;
  from: string;
  to: string;
  totals: StaffCommissionTotals;
}

/**
 * Load one staff member's commission totals over an inclusive `[from, to]` range
 * (AC3). Fetches the staff member (returns null if unknown) and their commission-
 * ledger lines whose `occurredAt` falls in the period, then nets them via the pure
 * {@link aggregateStaffCommission} — REUSING the commission ledger as the single
 * source of truth. Read-only.
 */
export async function loadStaffCommissionDrilldown(
  db: Executor,
  opts: LoadStaffCommissionDrilldownOpts,
): Promise<StaffCommissionDrilldown | null> {
  const [member] = await db
    .select({ id: staff.id, displayName: staff.displayName, role: staff.role })
    .from(staff)
    .where(eq(staff.id, opts.staffId));
  if (!member) return null;

  const rangeStart = dayStart(opts.from);
  const rangeEnd = nextDayStart(opts.to);

  const lines = await db
    .select({ amountCents: commissionLedger.amountCents, source: commissionLedger.source })
    .from(commissionLedger)
    .where(
      and(
        eq(commissionLedger.staffId, opts.staffId),
        gte(commissionLedger.occurredAt, rangeStart),
        lt(commissionLedger.occurredAt, rangeEnd),
      ),
    );

  const ledgerLines: CommissionLedgerLine[] = lines.map((l) => ({
    amountCents: l.amountCents,
    source: l.source,
  }));

  return {
    staffId: member.id,
    staffName: member.displayName,
    role: member.role,
    from: opts.from,
    to: opts.to,
    totals: aggregateStaffCommission(ledgerLines),
  };
}
