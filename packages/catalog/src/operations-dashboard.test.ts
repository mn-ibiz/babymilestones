import { describe, expect, it } from "vitest";
import {
  aggregateOperationsDashboard,
  type OperationsBookingRow,
  type OperationsDashboardInput,
} from "./operations-dashboard.js";

/**
 * P3-E05-S01 (Story 27.1) — pure daily-operations dashboard aggregation. Given
 * the day's flat booking rows (each carrying its unit + snapshotted revenue +
 * attributed staff), the in-progress session count, and the centre-wide
 * outstanding total, derive the dashboard tiles:
 *  - today's revenue: a grand total + a per-unit breakdown (AC1),
 *  - bookings count today (AC1),
 *  - active sessions (AC1) — passed straight through from the DB read,
 *  - outstanding balances total (AC1) — passed straight through,
 *  - top staff today by attributed revenue (AC1).
 * Exhaustively unit-tested — no I/O.
 */

const DATE = "2026-06-15";

function row(over: Partial<OperationsBookingRow> = {}): OperationsBookingRow {
  return {
    bookingId: over.bookingId ?? "b1",
    unit: over.unit ?? "play",
    revenueCents: over.revenueCents ?? 2500,
    staffId: over.staffId ?? null,
    staffName: over.staffName ?? "Unattributed",
  };
}

function input(over: Partial<OperationsDashboardInput> = {}): OperationsDashboardInput {
  return {
    date: over.date ?? DATE,
    bookings: over.bookings ?? [],
    activeSessions: over.activeSessions ?? 0,
    outstandingCents: over.outstandingCents ?? 0,
  };
}

describe("aggregateOperationsDashboard (Story 27.1)", () => {
  it("zero-data day: every tile reads zero, no per-unit or staff rows (AC1)", () => {
    const d = aggregateOperationsDashboard(input());
    expect(d.date).toBe(DATE);
    expect(d.bookingsCount).toBe(0);
    expect(d.activeSessions).toBe(0);
    expect(d.outstandingCents).toBe(0);
    expect(d.revenue.totalCents).toBe(0);
    // Every unit appears with a zero figure so the tile always lists the units.
    expect(d.revenue.byUnit).toEqual([
      { unit: "play", revenueCents: 0 },
      { unit: "talent", revenueCents: 0 },
      { unit: "salon", revenueCents: 0 },
      { unit: "coaching", revenueCents: 0 },
      { unit: "event", revenueCents: 0 },
    ]);
    expect(d.topStaff).toEqual([]);
  });

  it("counts bookings and sums revenue across multiple units (AC1)", () => {
    const d = aggregateOperationsDashboard(
      input({
        bookings: [
          row({ bookingId: "b1", unit: "play", revenueCents: 1000 }),
          row({ bookingId: "b2", unit: "play", revenueCents: 1500 }),
          row({ bookingId: "b3", unit: "salon", revenueCents: 3000 }),
          row({ bookingId: "b4", unit: "coaching", revenueCents: 500 }),
        ],
      }),
    );
    expect(d.bookingsCount).toBe(4);
    expect(d.revenue.totalCents).toBe(6000);
    const byUnit = Object.fromEntries(d.revenue.byUnit.map((u) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(2500);
    expect(byUnit.salon).toBe(3000);
    expect(byUnit.coaching).toBe(500);
    expect(byUnit.talent).toBe(0);
    expect(byUnit.event).toBe(0);
  });

  it("per-unit figures always sum to the headline total (AC1)", () => {
    const d = aggregateOperationsDashboard(
      input({
        bookings: [
          row({ bookingId: "b1", unit: "play", revenueCents: 1234 }),
          row({ bookingId: "b2", unit: "talent", revenueCents: 5678 }),
          row({ bookingId: "b3", unit: "event", revenueCents: 9000 }),
        ],
      }),
    );
    const sum = d.revenue.byUnit.reduce((acc, u) => acc + u.revenueCents, 0);
    expect(sum).toBe(d.revenue.totalCents);
    expect(d.revenue.totalCents).toBe(15912);
  });

  it("passes active sessions + outstanding total straight through (AC1)", () => {
    const d = aggregateOperationsDashboard(
      input({ activeSessions: 7, outstandingCents: 42_000 }),
    );
    expect(d.activeSessions).toBe(7);
    expect(d.outstandingCents).toBe(42_000);
  });

  it("ranks top staff by attributed revenue, breaking ties by name (AC1)", () => {
    const d = aggregateOperationsDashboard(
      input({
        bookings: [
          row({ bookingId: "b1", staffId: "s1", staffName: "Asha", revenueCents: 2000 }),
          row({ bookingId: "b2", staffId: "s1", staffName: "Asha", revenueCents: 1000 }),
          row({ bookingId: "b3", staffId: "s2", staffName: "Bree", revenueCents: 5000 }),
          row({ bookingId: "b4", staffId: "s3", staffName: "Cleo", revenueCents: 5000 }),
        ],
      }),
    );
    // s2/s3 tie on revenue (5000); the tie breaks by name ascending (Bree < Cleo).
    expect(d.topStaff).toEqual([
      { staffId: "s2", staffName: "Bree", bookings: 1, revenueCents: 5000 },
      { staffId: "s3", staffName: "Cleo", bookings: 1, revenueCents: 5000 },
      { staffId: "s1", staffName: "Asha", bookings: 2, revenueCents: 3000 },
    ]);
  });

  it("excludes unattributed bookings from the top-staff ranking but not revenue (AC1)", () => {
    const d = aggregateOperationsDashboard(
      input({
        bookings: [
          row({ bookingId: "b1", staffId: null, staffName: "Unattributed", revenueCents: 4000 }),
          row({ bookingId: "b2", staffId: "s1", staffName: "Asha", revenueCents: 1000 }),
        ],
      }),
    );
    expect(d.revenue.totalCents).toBe(5000);
    expect(d.bookingsCount).toBe(2);
    expect(d.topStaff).toEqual([
      { staffId: "s1", staffName: "Asha", bookings: 1, revenueCents: 1000 },
    ]);
  });

  it("limits the top-staff ranking to the configured cap (AC1)", () => {
    const bookings: OperationsBookingRow[] = Array.from({ length: 8 }, (_, i) =>
      row({ bookingId: `b${i}`, staffId: `s${i}`, staffName: `Staff ${i}`, revenueCents: (i + 1) * 100 }),
    );
    const d = aggregateOperationsDashboard(input({ bookings }), { topStaffLimit: 5 });
    expect(d.topStaff).toHaveLength(5);
    // Highest revenue first.
    expect(d.topStaff[0]!.staffName).toBe("Staff 7");
    expect(d.topStaff[4]!.staffName).toBe("Staff 3");
  });
});
