import { describe, expect, it } from "vitest";
import type { CoachingSlotOption } from "@bm/contracts";
import { coachingSeatsLabel, groupCoachingSlotsByDate } from "./coaching-book";

/** P5-E01-S02 (Story 31.2) / P5-E01-S03 (Story 31.3) — coaching booking view model. Pure, DOM-free. */

function slot(p: Partial<CoachingSlotOption> & { id: string; slotDate: string; startTime: string }): CoachingSlotOption {
  return {
    staffId: "s1",
    staffName: "Asha",
    endTime: "10:00",
    durationMinutes: 60,
    capacity: 1,
    seatsRemaining: 1,
    ...p,
  };
}

describe("groupCoachingSlotsByDate (AC2)", () => {
  it("groups slots by date, ascending by date then start time", () => {
    const groups = groupCoachingSlotsByDate([
      slot({ id: "b", slotDate: "2026-06-16", startTime: "11:00" }),
      slot({ id: "a2", slotDate: "2026-06-15", startTime: "11:00" }),
      slot({ id: "a1", slotDate: "2026-06-15", startTime: "09:00" }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-06-15", "2026-06-16"]);
    expect(groups[0]!.slots.map((s) => s.id)).toEqual(["a1", "a2"]); // start-time sorted
    expect(groups[0]!.weekdayLabel).toBe("Mon"); // 2026-06-15 is a Monday
    expect(groups[0]!.dayLabel).toBe("Jun 15");
  });

  it("omits dates with no open slots (only real availability)", () => {
    const groups = groupCoachingSlotsByDate([slot({ id: "x", slotDate: "2026-06-20", startTime: "09:00" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.date).toBe("2026-06-20");
  });

  it("returns an empty list when there are no slots", () => {
    expect(groupCoachingSlotsByDate([])).toEqual([]);
  });
});

describe("coachingSeatsLabel (P5-E01-S03 AC2)", () => {
  it("returns null for a 1:1 slot (capacity 1) — no seats badge", () => {
    expect(coachingSeatsLabel(slot({ id: "s", slotDate: "2026-06-15", startTime: "09:00" }))).toBeNull();
  });

  it("shows 'X seats left' for a group slot with seats remaining", () => {
    expect(
      coachingSeatsLabel(slot({ id: "s", slotDate: "2026-06-15", startTime: "09:00", capacity: 6, seatsRemaining: 6 })),
    ).toBe("6 seats left");
    expect(
      coachingSeatsLabel(slot({ id: "s", slotDate: "2026-06-15", startTime: "09:00", capacity: 6, seatsRemaining: 1 })),
    ).toBe("1 seat left");
  });

  it("shows 'Full' for a group slot with no seats remaining", () => {
    expect(
      coachingSeatsLabel(slot({ id: "s", slotDate: "2026-06-15", startTime: "09:00", capacity: 6, seatsRemaining: 0 })),
    ).toBe("Full");
  });
});
