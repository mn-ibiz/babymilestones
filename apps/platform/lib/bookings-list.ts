import type { ParentBooking } from "@bm/contracts";

/**
 * Parent bookings-list view model (P2-E01-S07). Pure + dependency-free so it
 * unit-tests without a DOM. Splits the parent's bookings into the Upcoming /
 * Today / Past tabs (AC1) and labels each row's attendance/status.
 */

export interface BookingTabs {
  upcoming: ParentBooking[];
  today: ParentBooking[];
  past: ParentBooking[];
}

/**
 * Group bookings by date relative to `today` (YYYY-MM-DD). Input is ascending by
 * date; the Past tab is reversed to most-recent-first (the natural read order).
 */
export function categorizeBookings(bookings: ParentBooking[], today: string): BookingTabs {
  const tabs: BookingTabs = { upcoming: [], today: [], past: [] };
  for (const b of bookings) {
    if (b.slotDate < today) tabs.past.push(b);
    else if (b.slotDate > today) tabs.upcoming.push(b);
    else tabs.today.push(b);
  }
  tabs.past.reverse();
  return tabs;
}

/**
 * A short status label for a booking row (AC1). Note: there is no real
 * attendance/no-show signal yet (check-in lands in epic 18), so a finished
 * booking is labelled "Past" rather than over-claiming "Attended".
 */
export function attendanceLabel(b: ParentBooking): string {
  if (b.status === "cancelled") return "Cancelled";
  if (b.isPast) return "Past";
  return "Upcoming";
}
