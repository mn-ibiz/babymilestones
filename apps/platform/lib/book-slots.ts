import type { AvailableSlot } from "@bm/contracts";

/**
 * Parent booking-browse view model (P2-E01-S02). Pure + dependency-free so it
 * unit-tests without a DOM and never pulls server-only code into the bundle.
 * Turns the flat availability slot list into a 7-day grid (AC1).
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Add `days` to a `YYYY-MM-DD` date using UTC math (matches the server). */
function addDaysIso(dateIso: string, days: number): string {
  const ms = Date.parse(`${dateIso}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A single day column in the 7-day grid. */
export interface DayColumn {
  date: string;
  /** e.g. "Mon". */
  weekdayLabel: string;
  /** e.g. "Jun 15". */
  dayLabel: string;
  /** Slots that day, ascending by start time. */
  slots: AvailableSlot[];
}

/** Display state of a single slot (drives styling — AC1/AC3). */
export type SlotState = "available" | "full" | "past";

/** Classify a slot for rendering: past (greyed), full (disabled), or available. */
export function slotState(slot: AvailableSlot): SlotState {
  if (slot.isPast) return "past";
  if (slot.remainingCapacity <= 0) return "full";
  return "available";
}

/**
 * Build a `days`-long grid (default 7, AC1) starting at `startDate`. Every date
 * gets a column even when it has no slots, so the UI renders a stable week. Slots
 * within a day are sorted by start time.
 */
export function buildWeekGrid(slots: AvailableSlot[], startDate: string, days = 7): DayColumn[] {
  const byDate = new Map<string, AvailableSlot[]>();
  for (const s of slots) {
    const bucket = byDate.get(s.slotDate);
    if (bucket) bucket.push(s);
    else byDate.set(s.slotDate, [s]);
  }
  const columns: DayColumn[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(startDate, i);
    const d = new Date(`${date}T00:00:00.000Z`);
    const daySlots = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    columns.push({
      date,
      weekdayLabel: WEEKDAYS[d.getUTCDay()]!,
      dayLabel: `${MONTHS[d.getUTCMonth()]!} ${d.getUTCDate()}`,
      slots: daySlots,
    });
  }
  return columns;
}
