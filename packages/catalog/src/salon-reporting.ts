/**
 * P3-E03-S05 (Story 25.5) — Salon-specific reporting aggregation.
 *
 * Pure, I/O-free reducer behind the admin "salon at a glance" tile + its
 * per-stylist drill-down. The DB read ({@link listSalonReportingRowsForDate} in
 * `salon.ts`) hands this helper the day's flat salon-booking rows — already
 * filtered to non-cancelled bookings whose slot falls on the date, joined to the
 * stylist, the booking's snapshotted revenue, and the attendance lifecycle — and
 * this reduces them to the tile totals and the per-stylist breakdown.
 *
 * Definitions (kept consistent with how the rest of salon reporting reads data):
 *  - REVENUE is the booking's `revenueCents` snapshot — the service price written
 *    onto the booking (`staffRateSnapshot`) + its pending/settled invoice at book
 *    time. Counted for every non-cancelled booking on the day, settled or not,
 *    matching the booking write path in `bookSalonSlot`.
 *  - A NO-SHOW is a non-cancelled booking whose slot END time has already passed
 *    at `now` AND which was never checked in (`checkedInAt === null`, no
 *    attendance) and never completed. A future/in-progress slot today is NOT yet a
 *    no-show; a completed booking never is. Derived from bookings + attendance
 *    state — there is no stored no-show flag.
 *
 * The forward-compatible integration point for the operational dashboard
 * (P3-E05 / Epic 27, not yet built): Epic 27 reuses this aggregation + the
 * `/admin/salon-report` endpoint to render the tile inside the dashboard grid.
 */

/** One day's salon booking, projected to exactly what the reporting needs. */
export interface SalonReportingRow {
  bookingId: string;
  staffId: string;
  /** Stylist display-name snapshot for the drill-down label. */
  staffName: string;
  /** The booking's invoiced amount snapshot in integer KES cents. */
  revenueCents: number;
  /** The slot date (`YYYY-MM-DD`). */
  slotDate: string;
  /** Slot window start `HH:MM` (24h, UTC — matches the slot math). */
  startTime: string;
  /** Slot window end `HH:MM` (24h, UTC). */
  endTime: string;
  /** When the child was checked in, or null (no-show candidate). */
  checkedInAt: string | null;
  /** When the salon service was completed, or null. */
  completedAt: string | null;
}

/** One stylist's slice of the day in the drill-down (AC2). */
export interface SalonStylistDayStats {
  staffId: string;
  staffName: string;
  /** Non-cancelled salon bookings attributed to this stylist on the day. */
  bookings: number;
  /** Of those, how many were no-shows (passed + never checked in). */
  noShows: number;
  /** Total invoiced revenue (cents) for this stylist's bookings on the day. */
  revenueCents: number;
}

/** The day's salon report: headline tile totals (AC1) + per-stylist drill-down (AC2). */
export interface SalonDayReport {
  /** The report date (`YYYY-MM-DD`). */
  date: string;
  /** Total non-cancelled salon bookings on the day (AC1). */
  bookings: number;
  /** Total no-shows on the day (AC1). */
  noShows: number;
  /** Total invoiced revenue (cents) on the day (AC1). */
  revenueCents: number;
  /** Per-stylist breakdown, ordered by stylist name then id (AC2). */
  stylists: SalonStylistDayStats[];
}

export interface AggregateSalonDayReportOpts {
  /** The report date (`YYYY-MM-DD`). Echoed back on the result. */
  date: string;
  /** The clock used to decide whether a slot has passed. Defaults to now. */
  now?: Date;
}

/** `YYYY-MM-DD` + `HH:MM` → epoch ms (UTC), matching the rest of the slot math. */
function slotEndUtcMs(slotDate: string, endTime: string): number {
  return Date.parse(`${slotDate}T${endTime}:00Z`);
}

/**
 * Whether a row is a no-show: never checked in, never completed, and its slot end
 * is at/after… no — its slot end has already PASSED at `now`. A booking whose slot
 * is still upcoming/in-progress is pending, not a no-show.
 */
function isNoShow(r: SalonReportingRow, nowMs: number): boolean {
  if (r.checkedInAt !== null) return false;
  if (r.completedAt !== null) return false;
  return slotEndUtcMs(r.slotDate, r.endTime) <= nowMs;
}

/**
 * Reduce the day's flat salon-booking rows to the tile totals (AC1) and the
 * per-stylist drill-down (AC2). Pure — no I/O. Stylists are ordered by display
 * name then staffId so the drill-down renders deterministically. The per-stylist
 * figures always sum to the headline totals.
 */
export function aggregateSalonDayReport(
  rows: readonly SalonReportingRow[],
  opts: AggregateSalonDayReportOpts,
): SalonDayReport {
  const nowMs = (opts.now ?? new Date()).getTime();

  let bookings = 0;
  let noShows = 0;
  let revenueCents = 0;

  const byStylist = new Map<string, SalonStylistDayStats>();

  for (const r of rows) {
    const noShow = isNoShow(r, nowMs);
    bookings += 1;
    revenueCents += r.revenueCents;
    if (noShow) noShows += 1;

    let entry = byStylist.get(r.staffId);
    if (!entry) {
      entry = {
        staffId: r.staffId,
        staffName: r.staffName,
        bookings: 0,
        noShows: 0,
        revenueCents: 0,
      };
      byStylist.set(r.staffId, entry);
    }
    entry.bookings += 1;
    entry.revenueCents += r.revenueCents;
    if (noShow) entry.noShows += 1;
  }

  const stylists = [...byStylist.values()].sort(
    (a, b) =>
      a.staffName.localeCompare(b.staffName) ||
      (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
  );

  return { date: opts.date, bookings, noShows, revenueCents, stylists };
}
