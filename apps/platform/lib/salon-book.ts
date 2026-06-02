import type { SalonSlotOption } from "@bm/contracts";

/**
 * Kids-Only Salon booking view model (P3-E03-S02 / Story 25.2). Pure +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the bundle. Groups the flat available-slot list into per-date buckets
 * for the parent's "pick a date → see slots" flow (AC1).
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The "Any available" sentinel value for the stylist picker (AC1/AC3). */
export const ANY_STYLIST = "" as const;

/** One date the parent can pick, with its open slots. */
export interface SalonDateGroup {
  date: string;
  /** e.g. "Mon". */
  weekdayLabel: string;
  /** e.g. "Jun 15". */
  dayLabel: string;
  /** Open slots that day, ascending by start time. */
  slots: SalonSlotOption[];
}

/** Format a `YYYY-MM-DD` date as "Mon · Jun 15" parts. */
function labelFor(date: string): { weekdayLabel: string; dayLabel: string } {
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    weekdayLabel: WEEKDAYS[d.getUTCDay()]!,
    dayLabel: `${MONTHS[d.getUTCMonth()]!} ${d.getUTCDate()}`,
  };
}

/**
 * Group available salon slots by their date (AC1), ascending by date then by
 * start time within a date. Only dates that actually have an open slot appear —
 * the parent picks from real availability (unlike the fixed-week session grid).
 */
export function groupSalonSlotsByDate(slots: SalonSlotOption[]): SalonDateGroup[] {
  const byDate = new Map<string, SalonSlotOption[]>();
  for (const s of slots) {
    const bucket = byDate.get(s.slotDate);
    if (bucket) bucket.push(s);
    else byDate.set(s.slotDate, [s]);
  }
  return [...byDate.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const { weekdayLabel, dayLabel } = labelFor(date);
      return {
        date,
        weekdayLabel,
        dayLabel,
        slots: byDate.get(date)!.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    });
}
