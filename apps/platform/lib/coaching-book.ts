import type { CoachingSlotOption } from "@bm/contracts";

/**
 * 1:1 Coaching booking view model (P5-E01-S02 / Story 31.2). Pure +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the bundle. Groups the flat available-slot list into per-date buckets
 * for the parent's "pick a coach → pick a date → see slots" flow (AC2).
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** One date the parent can pick, with its open coaching slots. */
export interface CoachingDateGroup {
  date: string;
  /** e.g. "Mon". */
  weekdayLabel: string;
  /** e.g. "Jun 15". */
  dayLabel: string;
  /** Open slots that day, ascending by start time. */
  slots: CoachingSlotOption[];
}

/**
 * The seats badge for a coaching slot (P5-E01-S03 / Story 31.3 AC2). A 1:1 slot
 * (capacity 1) gets NO badge (returns null) — seats only matter for a group. A
 * group slot shows "X seats left" (singular "1 seat left"), or "Full" at 0.
 */
export function coachingSeatsLabel(slot: CoachingSlotOption): string | null {
  if (slot.capacity <= 1) return null;
  if (slot.seatsRemaining <= 0) return "Full";
  return `${slot.seatsRemaining} seat${slot.seatsRemaining === 1 ? "" : "s"} left`;
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
 * Group available coaching slots by their date (AC2), ascending by date then by
 * start time within a date. Only dates that actually have an open slot appear —
 * the parent picks from real availability.
 */
export function groupCoachingSlotsByDate(slots: CoachingSlotOption[]): CoachingDateGroup[] {
  const byDate = new Map<string, CoachingSlotOption[]>();
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
