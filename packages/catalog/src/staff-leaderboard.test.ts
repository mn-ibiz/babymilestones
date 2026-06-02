import { describe, expect, it } from "vitest";
import {
  aggregateStaffLeaderboard,
  aggregateStaffCommission,
  type LeaderboardBookingRow,
  type LeaderboardStaffRow,
  type CommissionLedgerLine,
} from "./staff-leaderboard.js";

/**
 * P3-E05-S03 (Story 27.3) — pure top-staff-leaderboard aggregation. Given the
 * period's attributed booking rows (each carrying its staff + role + snapshotted
 * revenue) and the FULL roster of staff in scope (so a staff member with zero
 * services in the period still appears), derive per-staff totals (AC1):
 *  - total attributed revenue over the period,
 *  - count of services performed,
 *  - average ticket = revenue ÷ service count (0 when no services — no NaN).
 * The ranking is by revenue desc, then name, then id. Role filtering happens in
 * the DB read; the aggregation simply ranks whatever roster it is handed. Pure —
 * no I/O — so it is exhaustively unit-tested.
 */

const FROM = "2026-06-01";
const TO = "2026-06-07";

function staff(over: Partial<LeaderboardStaffRow> = {}): LeaderboardStaffRow {
  return {
    staffId: over.staffId ?? "s1",
    staffName: over.staffName ?? "Asha",
    role: over.role ?? "stylist",
  };
}

function booking(over: Partial<LeaderboardBookingRow> = {}): LeaderboardBookingRow {
  return {
    staffId: over.staffId ?? "s1",
    revenueCents: over.revenueCents ?? 1000,
  };
}

describe("aggregateStaffLeaderboard (Story 27.3)", () => {
  it("zero-data period: roster staff appear with zero totals, zero avg-ticket (AC1)", () => {
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [staff({ staffId: "s1", staffName: "Asha" })],
      bookings: [],
    });
    expect(out.from).toBe(FROM);
    expect(out.to).toBe(TO);
    expect(out.rows).toEqual([
      {
        staffId: "s1",
        staffName: "Asha",
        role: "stylist",
        revenueCents: 0,
        serviceCount: 0,
        avgTicketCents: 0,
      },
    ]);
  });

  it("computes per-staff revenue, service count, and average ticket (AC1)", () => {
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [staff({ staffId: "s1", staffName: "Asha" })],
      bookings: [
        booking({ staffId: "s1", revenueCents: 3000 }),
        booking({ staffId: "s1", revenueCents: 1000 }),
      ],
    });
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0]!;
    expect(r.revenueCents).toBe(4000);
    expect(r.serviceCount).toBe(2);
    // 4000 / 2 = 2000.
    expect(r.avgTicketCents).toBe(2000);
  });

  it("average ticket never divides by zero for a staff member with no services (AC1)", () => {
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [
        staff({ staffId: "s1", staffName: "Asha" }),
        staff({ staffId: "s2", staffName: "Bree" }),
      ],
      bookings: [booking({ staffId: "s1", revenueCents: 5000 })],
    });
    const byId = Object.fromEntries(out.rows.map((r) => [r.staffId, r]));
    expect(byId.s2!.serviceCount).toBe(0);
    expect(byId.s2!.revenueCents).toBe(0);
    expect(byId.s2!.avgTicketCents).toBe(0);
    expect(Number.isNaN(byId.s2!.avgTicketCents)).toBe(false);
  });

  it("average ticket truncates to whole integer cents (no fractional cents)", () => {
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [staff({ staffId: "s1", staffName: "Asha" })],
      bookings: [
        booking({ staffId: "s1", revenueCents: 1000 }),
        booking({ staffId: "s1", revenueCents: 1000 }),
        booking({ staffId: "s1", revenueCents: 1001 }),
      ],
    });
    // 3001 / 3 = 1000.33… → truncated to 1000 integer cents.
    expect(out.rows[0]!.avgTicketCents).toBe(1000);
  });

  it("ranks by revenue desc, then name, then id (AC1)", () => {
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [
        staff({ staffId: "s1", staffName: "Asha" }),
        staff({ staffId: "s2", staffName: "Bree" }),
        staff({ staffId: "s3", staffName: "Cleo" }),
      ],
      bookings: [
        booking({ staffId: "s1", revenueCents: 3000 }),
        booking({ staffId: "s2", revenueCents: 5000 }),
        booking({ staffId: "s3", revenueCents: 5000 }),
      ],
    });
    // s2/s3 tie on revenue (5000); tie breaks by name ascending (Bree < Cleo).
    expect(out.rows.map((r) => r.staffId)).toEqual(["s2", "s3", "s1"]);
  });

  it("ignores attributed bookings whose staff is not in the roster (role-filtered out)", () => {
    // The DB read pre-filters the roster by role; a booking attributed to an
    // out-of-scope staff id must not resurrect that staff member.
    const out = aggregateStaffLeaderboard({
      from: FROM,
      to: TO,
      staff: [staff({ staffId: "s1", staffName: "Asha", role: "stylist" })],
      bookings: [
        booking({ staffId: "s1", revenueCents: 2000 }),
        booking({ staffId: "sX", revenueCents: 9999 }), // an instructor, out of scope
      ],
    });
    expect(out.rows.map((r) => r.staffId)).toEqual(["s1"]);
    expect(out.rows[0]!.revenueCents).toBe(2000);
  });
});

describe("aggregateStaffCommission (Story 27.3 drill-down, AC3)", () => {
  it("nets accruals minus reversals over the period's ledger lines", () => {
    const lines: CommissionLedgerLine[] = [
      { amountCents: 1500, source: "booking" },
      { amountCents: 800, source: "booking" },
      { amountCents: -500, source: "refund_reversal" },
    ];
    const out = aggregateStaffCommission(lines);
    expect(out.netCents).toBe(1800);
    expect(out.accruedCents).toBe(2300);
    expect(out.reversedCents).toBe(500);
    expect(out.entryCount).toBe(3);
  });

  it("returns zeros for a staff member with no commission in the period", () => {
    const out = aggregateStaffCommission([]);
    expect(out).toEqual({ netCents: 0, accruedCents: 0, reversedCents: 0, entryCount: 0 });
  });
});
