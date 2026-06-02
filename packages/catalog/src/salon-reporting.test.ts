import { describe, expect, it } from "vitest";
import {
  aggregateSalonDayReport,
  type SalonReportingRow,
} from "./salon-reporting.js";

/**
 * P3-E03-S05 (Story 25.5) — pure salon-day reporting aggregation. Given the day's
 * flat salon-booking rows (each carrying its stylist, snapshotted revenue, and
 * attendance lifecycle), derive the headline totals (bookings / no-shows /
 * revenue) and the per-stylist drill-down. Exhaustively unit-tested — no I/O.
 *
 * No-show rule: a (non-cancelled) salon booking whose slot END time has already
 * passed at `now` and that was NEVER checked in (`checkedInAt === null`).
 * Revenue rule: the booking's `revenueCents` snapshot (the service price written
 * onto the booking/invoice at book time), summed regardless of check-in state.
 */

const DATE = "2026-06-15";
/** A time on DATE AFTER the morning slots end (so 09:00–12:00 slots have passed). */
const AFTERNOON = new Date("2026-06-15T15:00:00Z");

function row(over: Partial<SalonReportingRow> = {}): SalonReportingRow {
  return {
    bookingId: over.bookingId ?? "b1",
    staffId: over.staffId ?? "s1",
    staffName: over.staffName ?? "Asha",
    revenueCents: over.revenueCents ?? 2500,
    slotDate: over.slotDate ?? DATE,
    startTime: over.startTime ?? "09:00",
    endTime: over.endTime ?? "10:00",
    checkedInAt: over.checkedInAt ?? null,
    completedAt: over.completedAt ?? null,
  };
}

describe("aggregateSalonDayReport (Story 25.5)", () => {
  it("zero-data day: all totals zero, no stylists (AC1)", () => {
    const report = aggregateSalonDayReport([], { date: DATE, now: AFTERNOON });
    expect(report.date).toBe(DATE);
    expect(report.bookings).toBe(0);
    expect(report.noShows).toBe(0);
    expect(report.revenueCents).toBe(0);
    expect(report.stylists).toEqual([]);
  });

  it("counts a checked-in booking as a booking + revenue, NOT a no-show (AC1)", () => {
    const report = aggregateSalonDayReport(
      [row({ checkedInAt: "2026-06-15T09:05:00Z", revenueCents: 2500 })],
      { date: DATE, now: AFTERNOON },
    );
    expect(report.bookings).toBe(1);
    expect(report.noShows).toBe(0);
    expect(report.revenueCents).toBe(2500);
  });

  it("counts a passed, never-checked-in booking as a no-show (AC1)", () => {
    const report = aggregateSalonDayReport(
      [row({ checkedInAt: null, endTime: "10:00", revenueCents: 2500 })],
      { date: DATE, now: AFTERNOON },
    );
    expect(report.bookings).toBe(1);
    expect(report.noShows).toBe(1);
    // Revenue still counts the booking's snapshot (it was invoiced at book time).
    expect(report.revenueCents).toBe(2500);
  });

  it("a not-yet-checked-in booking whose slot has NOT passed is not a no-show", () => {
    // now is BEFORE the slot ends → still pending, not a no-show.
    const beforeSlot = new Date("2026-06-15T08:00:00Z");
    const report = aggregateSalonDayReport(
      [row({ checkedInAt: null, startTime: "09:00", endTime: "10:00" })],
      { date: DATE, now: beforeSlot },
    );
    expect(report.bookings).toBe(1);
    expect(report.noShows).toBe(0);
  });

  it("a completed booking is never a no-show even if checkedInAt is null", () => {
    const report = aggregateSalonDayReport(
      [row({ checkedInAt: null, completedAt: "2026-06-15T10:30:00Z" })],
      { date: DATE, now: AFTERNOON },
    );
    expect(report.bookings).toBe(1);
    expect(report.noShows).toBe(0);
  });

  it("splits totals across multiple stylists in the drill-down (AC2)", () => {
    const report = aggregateSalonDayReport(
      [
        // Asha: 2 bookings, 1 no-show, 5000 revenue.
        row({ bookingId: "b1", staffId: "asha", staffName: "Asha", checkedInAt: "2026-06-15T09:05:00Z", revenueCents: 2500 }),
        row({ bookingId: "b2", staffId: "asha", staffName: "Asha", checkedInAt: null, endTime: "10:00", revenueCents: 2500 }),
        // Bree: 1 booking, 0 no-shows, 3000 revenue.
        row({ bookingId: "b3", staffId: "bree", staffName: "Bree", checkedInAt: "2026-06-15T11:05:00Z", revenueCents: 3000, startTime: "11:00", endTime: "12:00" }),
      ],
      { date: DATE, now: AFTERNOON },
    );

    expect(report.bookings).toBe(3);
    expect(report.noShows).toBe(1);
    expect(report.revenueCents).toBe(8000);

    expect(report.stylists).toHaveLength(2);
    // Ordered alphabetically by stylist name for a deterministic drill-down.
    expect(report.stylists.map((s) => s.staffName)).toEqual(["Asha", "Bree"]);

    const asha = report.stylists.find((s) => s.staffId === "asha")!;
    expect(asha).toMatchObject({ bookings: 2, noShows: 1, revenueCents: 5000 });
    const bree = report.stylists.find((s) => s.staffId === "bree")!;
    expect(bree).toMatchObject({ bookings: 1, noShows: 0, revenueCents: 3000 });
  });

  it("per-stylist totals sum to the headline totals (invariant)", () => {
    const rows = [
      row({ bookingId: "b1", staffId: "a", staffName: "A", revenueCents: 1000, checkedInAt: "2026-06-15T09:05:00Z" }),
      row({ bookingId: "b2", staffId: "a", staffName: "A", revenueCents: 1500, checkedInAt: null }),
      row({ bookingId: "b3", staffId: "b", staffName: "B", revenueCents: 2000, checkedInAt: null }),
    ];
    const report = aggregateSalonDayReport(rows, { date: DATE, now: AFTERNOON });
    expect(report.stylists.reduce((n, s) => n + s.bookings, 0)).toBe(report.bookings);
    expect(report.stylists.reduce((n, s) => n + s.noShows, 0)).toBe(report.noShows);
    expect(report.stylists.reduce((n, s) => n + s.revenueCents, 0)).toBe(report.revenueCents);
  });

  it("ties on stylist name break on staffId for deterministic order", () => {
    const report = aggregateSalonDayReport(
      [
        row({ bookingId: "b1", staffId: "zzz", staffName: "Sam" }),
        row({ bookingId: "b2", staffId: "aaa", staffName: "Sam" }),
      ],
      { date: DATE, now: AFTERNOON },
    );
    expect(report.stylists.map((s) => s.staffId)).toEqual(["aaa", "zzz"]);
  });
});
