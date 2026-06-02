import { describe, expect, it } from "vitest";
import type { SalonCounterBoard, SalonCounterBooking } from "@bm/contracts";
import {
  canCapturePhoto,
  canReassign,
  reassignTargetOptions,
  salonBookingLabel,
  salonBookingState,
  salonCheckInMessage,
  salonReassignMessage,
  salonStateLabel,
} from "./salon-counter";

function booking(over: Partial<SalonCounterBooking>): SalonCounterBooking {
  return {
    bookingId: "b1",
    salonSlotId: "s1",
    staffId: "stylist-1",
    staffName: "Asha",
    childId: "c1",
    childName: "Zola",
    photoConsent: false,
    serviceId: "svc",
    serviceName: "Kids Cut",
    slotDate: "2026-06-15",
    startTime: "09:00",
    endTime: "10:00",
    paidVia: "wallet",
    checkedInAt: null,
    completedAt: null,
    photoRef: null,
    ...over,
  };
}

describe("salon counter helpers (P3-E03-S03 / Story 25.3)", () => {
  it("resolves the lifecycle state (AC2/AC3)", () => {
    expect(salonBookingState(booking({}))).toBe("awaiting_checkin");
    expect(salonBookingState(booking({ checkedInAt: "2026-06-15T09:00:00.000Z" }))).toBe("in_service");
    expect(
      salonBookingState(
        booking({ checkedInAt: "2026-06-15T09:00:00.000Z", completedAt: "2026-06-15T10:00:00.000Z" }),
      ),
    ).toBe("completed");
  });

  it("labels a booking row and its state", () => {
    expect(salonBookingLabel(booking({}))).toBe("09:00–10:00 · Zola");
    expect(salonStateLabel(booking({}))).toBe("awaiting check-in");
    expect(salonStateLabel(booking({ checkedInAt: "x" }))).toBe("in service");
    expect(salonStateLabel(booking({ checkedInAt: "x", completedAt: "y" }))).toBe("✓ completed");
  });

  it("gates photo capture on consent (AC3)", () => {
    expect(canCapturePhoto(booking({ photoConsent: true }))).toBe(true);
    expect(canCapturePhoto(booking({ photoConsent: false }))).toBe(false);
  });

  it("messages a check-in outcome, flagging outstanding (AC2)", () => {
    expect(salonCheckInMessage("settled")).toMatch(/charged/i);
    expect(salonCheckInMessage("covered")).toMatch(/subscription/i);
    expect(salonCheckInMessage("outstanding")).toMatch(/outstanding/i);
  });

  // --- Story 25.4: reassign view-model ------------------------------------

  it("allows reassign before completion, never after (25.4 AC1)", () => {
    expect(canReassign(booking({}))).toBe(true); // awaiting check-in
    expect(canReassign(booking({ checkedInAt: "x" }))).toBe(true); // in service
    expect(canReassign(booking({ checkedInAt: "x", completedAt: "y" }))).toBe(false); // completed
  });

  it("offers every OTHER stylist on the board as a reassign target, excluding the current one (25.4 AC1)", () => {
    const board: SalonCounterBoard = {
      date: "2026-06-15",
      stylists: [
        { staffId: "stylist-1", staffName: "Asha", hours: [] },
        { staffId: "stylist-2", staffName: "Bree", hours: [] },
        { staffId: "stylist-3", staffName: "Cleo", hours: [] },
      ],
    };
    const b = booking({ staffId: "stylist-1" });
    const opts = reassignTargetOptions(board, b);
    expect(opts.map((o) => o.staffId)).toEqual(["stylist-2", "stylist-3"]);
    expect(opts.map((o) => o.staffName)).toEqual(["Bree", "Cleo"]);
    // The current stylist is never a target.
    expect(opts.find((o) => o.staffId === "stylist-1")).toBeUndefined();
  });

  it("returns no targets when the booking's stylist is the only one (25.4 AC1)", () => {
    const board: SalonCounterBoard = {
      date: "2026-06-15",
      stylists: [{ staffId: "stylist-1", staffName: "Asha", hours: [] }],
    };
    expect(reassignTargetOptions(board, booking({ staffId: "stylist-1" }))).toEqual([]);
  });

  it("messages a reassign result (25.4 AC1)", () => {
    expect(salonReassignMessage(true)).toMatch(/commission/i);
    expect(salonReassignMessage(false)).toMatch(/moved|reassigned/i);
  });
});
