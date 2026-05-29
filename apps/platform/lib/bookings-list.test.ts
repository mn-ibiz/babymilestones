import { describe, expect, it } from "vitest";
import type { ParentBooking } from "@bm/contracts";
import { attendanceLabel, categorizeBookings } from "./bookings-list";

const b = (over: Partial<ParentBooking>): ParentBooking => ({
  bookingId: "b",
  serviceId: "s",
  serviceName: "Soft Play",
  childId: "c",
  childName: "Zola",
  slotId: "sl",
  slotDate: "2026-06-15",
  startTime: "09:00",
  endTime: "10:00",
  status: "confirmed",
  isPast: false,
  canModify: true,
  ...over,
});

describe("bookings-list view model (P2-E01-S07)", () => {
  it("splits bookings into upcoming / today / past relative to today (AC1)", () => {
    const tabs = categorizeBookings(
      [
        b({ bookingId: "past", slotDate: "2026-06-10" }),
        b({ bookingId: "today", slotDate: "2026-06-15" }),
        b({ bookingId: "soon", slotDate: "2026-06-20" }),
      ],
      "2026-06-15",
    );
    expect(tabs.past.map((x) => x.bookingId)).toEqual(["past"]);
    expect(tabs.today.map((x) => x.bookingId)).toEqual(["today"]);
    expect(tabs.upcoming.map((x) => x.bookingId)).toEqual(["soon"]);
  });

  it("labels status truthfully — no fake 'Attended' without check-in data (AC1)", () => {
    expect(attendanceLabel(b({ status: "cancelled" }))).toBe("Cancelled");
    expect(attendanceLabel(b({ isPast: true }))).toBe("Past");
    expect(attendanceLabel(b({ isPast: false }))).toBe("Upcoming");
    // cancelled wins over past.
    expect(attendanceLabel(b({ status: "cancelled", isPast: true }))).toBe("Cancelled");
  });

  it("orders the Past tab most-recent-first", () => {
    const tabs = categorizeBookings(
      [
        b({ bookingId: "older", slotDate: "2026-06-10" }),
        b({ bookingId: "newer", slotDate: "2026-06-12" }),
      ],
      "2026-06-15",
    );
    expect(tabs.past.map((x) => x.bookingId)).toEqual(["newer", "older"]);
  });
});
