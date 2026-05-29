import { describe, expect, it } from "vitest";
import type { AvailableSlot } from "@bm/contracts";
import { buildWeekGrid, slotState } from "./book-slots";

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

describe("book-slots view model (P2-E01-S02)", () => {
  it("classifies slot state (available / full / past)", () => {
    expect(slotState(slot({}))).toBe("available");
    expect(slotState(slot({ remainingCapacity: 0 }))).toBe("full");
    expect(slotState(slot({ isPast: true }))).toBe("past"); // past wins over capacity
    expect(slotState(slot({ isPast: true, remainingCapacity: 0 }))).toBe("past");
  });

  it("builds a 7-day grid with a column per day, even empty ones (AC1)", () => {
    const grid = buildWeekGrid([slot({ slotDate: "2026-06-17", startTime: "10:00" })], "2026-06-15");
    expect(grid).toHaveLength(7);
    expect(grid[0]!.date).toBe("2026-06-15");
    expect(grid[6]!.date).toBe("2026-06-21");
    expect(grid[0]!.slots).toHaveLength(0); // empty day still rendered
    expect(grid[2]!.date).toBe("2026-06-17");
    expect(grid[2]!.slots).toHaveLength(1);
    expect(grid[0]!.weekdayLabel).toBe("Mon"); // 2026-06-15 is a Monday
    expect(grid[0]!.dayLabel).toBe("Jun 15");
  });

  it("sorts slots within a day by start time", () => {
    const grid = buildWeekGrid(
      [
        slot({ id: "b", startTime: "14:00" }),
        slot({ id: "a", startTime: "09:00" }),
        slot({ id: "c", startTime: "11:30" }),
      ],
      "2026-06-15",
      1,
    );
    expect(grid[0]!.slots.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});
