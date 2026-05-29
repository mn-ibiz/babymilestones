import type { AvailableSlot } from "@bm/contracts";

/**
 * Reception "New booking" view model (P2-E01-S04). Pure + dependency-free so it
 * unit-tests without a DOM. Reception books a specific slot at the counter, so a
 * flat chronological list of the *bookable* slots (grouped by day) is the slot
 * picker — no 7-day grid needed.
 */

/** A day with its bookable slots (ascending by start time). */
export interface BookableDay {
  date: string;
  slots: AvailableSlot[];
}

/**
 * Group the AVAILABLE slots (not past, capacity remaining) by date, ascending by
 * date then start time. Past / full slots are dropped — Reception only books a
 * seat that can actually be taken.
 */
export function bookableSlotsByDate(slots: AvailableSlot[]): BookableDay[] {
  const byDate = new Map<string, AvailableSlot[]>();
  for (const s of slots) {
    if (!s.available) continue;
    const bucket = byDate.get(s.slotDate);
    if (bucket) bucket.push(s);
    else byDate.set(s.slotDate, [s]);
  }
  return [...byDate.keys()]
    .sort()
    .map((date) => ({
      date,
      slots: byDate.get(date)!.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
}

/** Whether a booking can be submitted: a child, a service, and a slot are chosen. */
export function canConfirmBooking(state: {
  childId: string | null;
  serviceId: string | null;
  slotId: string | null;
}): boolean {
  return Boolean(state.childId && state.serviceId && state.slotId);
}
