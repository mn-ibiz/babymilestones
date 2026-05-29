import { describe, expect, it } from "vitest";
import type { AttendanceBookingCard, AttendanceSlot } from "@bm/contracts";
import {
  bulkCandidates,
  checkInProgress,
  isAwaitingCheckIn,
  outcomeMessage,
  slotLabel,
} from "./attendance";

const slot: AttendanceSlot = {
  slotId: "s1",
  serviceId: "svc1",
  serviceName: "Soft Play",
  slotDate: "2026-06-18",
  startTime: "09:00",
  endTime: "10:00",
  capacity: 5,
  bookedCount: 3,
  checkedInCount: 1,
};

function card(over: Partial<AttendanceBookingCard>): AttendanceBookingCard {
  return {
    bookingId: "b1",
    childId: "c1",
    childName: "Kid",
    photoConsent: false,
    paidVia: "wallet",
    checkedInAt: null,
    droppedOffAt: null,
    checkedOutAt: null,
    ...over,
  };
}

describe("attendance helpers (P2-E03-S02)", () => {
  it("labels a slot and its progress (AC1)", () => {
    expect(slotLabel(slot)).toBe("09:00–10:00 · Soft Play");
    expect(checkInProgress(slot)).toBe("1 / 3 checked in");
  });

  it("detects awaiting check-in (AC2)", () => {
    expect(isAwaitingCheckIn(card({ checkedInAt: null }))).toBe(true);
    expect(isAwaitingCheckIn(card({ checkedInAt: "2026-06-18T09:00:00.000Z" }))).toBe(false);
  });

  it("collects only not-yet-checked-in bookings for bulk (AC4)", () => {
    const cards = [
      card({ bookingId: "a", checkedInAt: null }),
      card({ bookingId: "b", checkedInAt: "2026-06-18T09:00:00.000Z" }),
      card({ bookingId: "c", checkedInAt: null }),
    ];
    expect(bulkCandidates(cards)).toEqual(["a", "c"]);
  });

  it("messages each outcome, flagging outstanding (AC3)", () => {
    expect(outcomeMessage("settled")).toMatch(/charged/i);
    expect(outcomeMessage("covered")).toMatch(/subscription/i);
    expect(outcomeMessage("outstanding")).toMatch(/outstanding/i);
  });
});
