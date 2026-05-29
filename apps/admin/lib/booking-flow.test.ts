import { describe, expect, it } from "vitest";
import type { AvailableSlot } from "@bm/contracts";
import { bookableSlotsByDate, canConfirmBooking } from "./booking-flow";

const slot = (over: Partial<AvailableSlot>): AvailableSlot => ({
  id: "s",
  slotDate: "2026-06-15",
  startTime: "09:00",
  endTime: "10:00",
  capacity: 5,
  remainingCapacity: 5,
  isPast: false,
  available: true,
  ...over,
});

describe("reception booking flow (P2-E01-S04)", () => {
  it("groups only bookable slots by date, sorted", () => {
    const days = bookableSlotsByDate([
      slot({ id: "b", slotDate: "2026-06-15", startTime: "14:00" }),
      slot({ id: "a", slotDate: "2026-06-15", startTime: "09:00" }),
      slot({ id: "past", isPast: true, available: false }),
      slot({ id: "full", remainingCapacity: 0, available: false }),
      slot({ id: "c", slotDate: "2026-06-16", startTime: "10:00" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-06-15", "2026-06-16"]);
    expect(days[0]!.slots.map((s) => s.id)).toEqual(["a", "b"]); // sorted, past/full dropped
    expect(days[1]!.slots.map((s) => s.id)).toEqual(["c"]);
  });

  it("gates confirmation on child + service + slot", () => {
    expect(canConfirmBooking({ childId: null, serviceId: "s", slotId: "x" })).toBe(false);
    expect(canConfirmBooking({ childId: "c", serviceId: "s", slotId: null })).toBe(false);
    expect(canConfirmBooking({ childId: "c", serviceId: "s", slotId: "x" })).toBe(true);
  });
});
