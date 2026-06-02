import { describe, expect, it } from "vitest";
import type { SalonSlotOption } from "@bm/contracts";
import { ANY_STYLIST, groupSalonSlotsByDate } from "./salon-book";

/** P3-E03-S02 (Story 25.2) — salon booking view model. Pure, DOM-free. */

function slot(p: Partial<SalonSlotOption> & { id: string; slotDate: string; startTime: string }): SalonSlotOption {
  return {
    staffId: "s1",
    staffName: "Asha",
    endTime: "10:00",
    durationMinutes: 60,
    ...p,
  };
}

describe("groupSalonSlotsByDate (AC1)", () => {
  it("groups slots by date, ascending by date then start time", () => {
    const groups = groupSalonSlotsByDate([
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
    const groups = groupSalonSlotsByDate([slot({ id: "x", slotDate: "2026-06-20", startTime: "09:00" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.date).toBe("2026-06-20");
  });

  it("returns an empty list when there are no slots", () => {
    expect(groupSalonSlotsByDate([])).toEqual([]);
  });

  it('exposes an "Any available" sentinel for the stylist picker (AC3)', () => {
    expect(ANY_STYLIST).toBe("");
  });
});
