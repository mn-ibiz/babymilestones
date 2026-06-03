import { and, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { attendances, bookings, invoices, services, staff } from "@bm/db";
import type { Executor } from "./services.js";
import {
  aggregateOperationsDashboard,
  type AggregateOperationsDashboardOpts,
  type OperationsBookingRow,
  type OperationsDashboard,
} from "./operations-dashboard.js";
import type { ServiceUnit } from "./services.js";

/**
 * P3-E05-S01 (Story 27.1) — DB read behind the daily-operations dashboard. A thin
 * projection: it loads the day's non-cancelled bookings (joined to their service
 * unit + live staff name), counts the in-progress sessions, and sums the
 * centre-wide outstanding balance, then hands everything to the pure
 * {@link aggregateOperationsDashboard} reducer. Read-only.
 *
 * Day boundaries are UTC `[date 00:00, next-day 00:00)` on the booking's
 * `checkedInAt` stamp (the visit time — the same field the booking write path
 * sets), matching how the rest of reporting keys "today".
 *
 * Outstanding is the same definition the wallet/parent surfaces use: the sum of
 * `invoices.amount_due` where status is NOT settled/void — here summed across
 * EVERY parent for the centre-wide figure. Active sessions are check-ins that
 * have neither been checked out (crèche hand-off) nor completed (salon).
 */
export interface LoadOperationsDashboardOpts {
  /** The report date (`YYYY-MM-DD`). */
  date: string;
  /** Cap on the top-staff ranking (passed through to the reducer). */
  topStaffLimit?: number;
}

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` → the UTC start of the NEXT calendar day (exclusive upper bound). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + 24 * 60 * 60 * 1000);
}

export async function loadOperationsDashboard(
  db: Executor,
  opts: LoadOperationsDashboardOpts,
): Promise<OperationsDashboard> {
  const from = dayStart(opts.date);
  const to = nextDayStart(opts.date);

  // The day's non-cancelled bookings, joined to the service unit + live staff name.
  const bookingRows = await db
    .select({
      bookingId: bookings.id,
      unit: services.unit,
      revenueCents: bookings.staffRateSnapshot,
      staffId: bookings.staffId,
      staffName: staff.displayName,
      staffNameSnapshot: bookings.staffNameSnapshot,
    })
    .from(bookings)
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(staff, eq(bookings.staffId, staff.id))
    .where(
      and(
        gte(bookings.checkedInAt, from),
        lt(bookings.checkedInAt, to),
        ne(bookings.status, "cancelled"),
      ),
    );

  const dashboardBookings: OperationsBookingRow[] = bookingRows.map((r) => ({
    bookingId: r.bookingId,
    unit: (r.unit as ServiceUnit | null) ?? null,
    revenueCents: r.revenueCents,
    staffId: r.staffId,
    // Prefer the live staff name; fall back to the booking snapshot.
    staffName: r.staffName ?? r.staffNameSnapshot,
  }));

  // Active sessions: checked in, not yet checked out (crèche) or completed (salon).
  // Bounded to the day's check-ins so a stale/forgotten prior-day open attendance
  // can't inflate "active" indefinitely (matches the sibling peak-hours read).
  const [{ active } = { active: 0 }] = await db
    .select({ active: sql<number>`COUNT(*)::int` })
    .from(attendances)
    .where(
      and(
        isNull(attendances.checkedOutAt),
        isNull(attendances.completedAt),
        gte(attendances.checkedInAt, from),
        lt(attendances.checkedInAt, to),
      ),
    );

  // Centre-wide outstanding: sum of open invoices across every parent. The
  // `amount_due > 0` guard matches the wallet-aging report's definition.
  const [{ owed } = { owed: "0" }] = await db
    .select({ owed: sql<string>`COALESCE(SUM(${invoices.amountDue}), 0)` })
    .from(invoices)
    .where(sql`${invoices.status} NOT IN ('settled', 'void') AND ${invoices.amountDue} > 0`);

  const aggOpts: AggregateOperationsDashboardOpts = { topStaffLimit: opts.topStaffLimit };
  return aggregateOperationsDashboard(
    {
      date: opts.date,
      bookings: dashboardBookings,
      activeSessions: Number(active),
      outstandingCents: Number(owed),
    },
    aggOpts,
  );
}
