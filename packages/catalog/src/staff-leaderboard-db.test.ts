import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  commissionLedger,
  invoices,
  parents,
  services,
  staff,
  users,
} from "@bm/db";
import {
  loadStaffLeaderboard,
  loadStaffCommissionDrilldown,
} from "./staff-leaderboard-db.js";

/**
 * P3-E05-S03 (Story 27.3) — DB reads behind the top-staff leaderboard. DB-backed
 * via the PGlite harness. Verifies the leaderboard read sums per-staff attributed
 * booking revenue + service count over the `[from, to]` range (keyed on
 * `checkedInAt`, cancelled excluded), filters the roster by role (AC2), zero-fills
 * staff with no services (AC1), and that the drill-down read nets a staff member's
 * commission-ledger lines over the period (AC3).
 */
describe("loadStaffLeaderboard / drill-down (Story 27.3)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25475${String(3_000_000 + phoneSeq++).padStart(7, "0")}`;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedFamily() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Pat", lastName: "Doe" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    return { parentId: p!.id, childId: c!.id };
  }

  async function seedBooking(opts: {
    parentId: string;
    childId: string;
    serviceId: string | null;
    staffId: string | null;
    revenueCents: number;
    checkedInAt: Date;
    status?: string;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: opts.revenueCents, serviceId: opts.serviceId })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffId: opts.staffId,
        staffNameSnapshot: "Snapshot",
        staffRateSnapshot: opts.revenueCents,
        invoiceId: inv!.id,
        status: opts.status ?? "confirmed",
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    return { bookingId: b!.id, invoiceId: inv!.id };
  }

  it("sums per-staff revenue + service count over the range; cancelled/out-of-range excluded (AC1)", async () => {
    const [asha] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();

    await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 1000, checkedInAt: new Date("2026-06-05T10:00:00Z") });
    // Cancelled in range — excluded.
    await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 9999, checkedInAt: new Date("2026-06-04T10:00:00Z"), status: "cancelled" });
    // Out of range — excluded.
    await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 7777, checkedInAt: new Date("2026-07-01T10:00:00Z") });

    const out = await loadStaffLeaderboard(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0]!;
    expect(r.staffName).toBe("Asha");
    expect(r.revenueCents).toBe(4000); // 3000 + 1000
    expect(r.serviceCount).toBe(2);
    expect(r.avgTicketCents).toBe(2000); // 4000 / 2
  });

  it("filters the roster by role (AC2)", async () => {
    const [stylist] = await dbh.db.insert(staff).values({ displayName: "Stella", role: "stylist" }).returning();
    const [instructor] = await dbh.db.insert(staff).values({ displayName: "Ivan", role: "instructor" }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Svc", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedBooking({ ...fam, serviceId: svc!.id, staffId: stylist!.id, revenueCents: 2000, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: svc!.id, staffId: instructor!.id, revenueCents: 5000, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const out = await loadStaffLeaderboard(dbh.db, { from: "2026-06-01", to: "2026-06-07", role: "stylist" });
    expect(out.rows.map((r) => r.staffName)).toEqual(["Stella"]);
    expect(out.rows[0]!.revenueCents).toBe(2000);
  });

  it("zero-fills an in-scope staff member with no services in the period (AC1)", async () => {
    const [asha] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    const [bree] = await dbh.db.insert(staff).values({ displayName: "Bree", role: "stylist" }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Svc", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedBooking({ ...fam, serviceId: svc!.id, staffId: asha!.id, revenueCents: 5000, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const out = await loadStaffLeaderboard(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    const byName = Object.fromEntries(out.rows.map((r) => [r.staffName, r]));
    expect(byName.Bree!.serviceCount).toBe(0);
    expect(byName.Bree!.revenueCents).toBe(0);
    expect(byName.Bree!.avgTicketCents).toBe(0);
    expect(bree!.id).toBeTruthy();
  });

  it("nets the per-staff commission drill-down over the period (AC3)", async () => {
    const [asha] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    const b1 = await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    const b2 = await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 2000, checkedInAt: new Date("2026-06-05T10:00:00Z") });
    const b3 = await seedBooking({ ...fam, serviceId: play!.id, staffId: asha!.id, revenueCents: 4000, checkedInAt: new Date("2026-07-01T10:00:00Z") });

    await dbh.db.insert(commissionLedger).values({
      staffId: asha!.id,
      bookingId: b1.bookingId,
      amountCents: 1500,
      rateSnapshot: "10.00",
      source: "booking",
      occurredAt: new Date("2026-06-03T10:00:00Z"),
    });
    const [accrual2] = await dbh.db
      .insert(commissionLedger)
      .values({
        staffId: asha!.id,
        bookingId: b2.bookingId,
        amountCents: 800,
        rateSnapshot: "10.00",
        source: "booking",
        occurredAt: new Date("2026-06-05T10:00:00Z"),
      })
      .returning();
    // A reversal in range.
    await dbh.db.insert(commissionLedger).values({
      staffId: asha!.id,
      bookingId: b2.bookingId,
      amountCents: -500,
      rateSnapshot: "10.00",
      source: "refund_reversal",
      reversesEntryId: accrual2!.id,
      occurredAt: new Date("2026-06-06T10:00:00Z"),
    });
    // An accrual OUTSIDE the range (different booking) — excluded.
    await dbh.db.insert(commissionLedger).values({
      staffId: asha!.id,
      bookingId: b3.bookingId,
      amountCents: 9999,
      rateSnapshot: "10.00",
      source: "booking",
      occurredAt: new Date("2026-07-01T10:00:00Z"),
    });

    const out = await loadStaffCommissionDrilldown(dbh.db, {
      staffId: asha!.id,
      from: "2026-06-01",
      to: "2026-06-07",
    });
    expect(out).not.toBeNull();
    expect(out!.staffName).toBe("Asha");
    expect(out!.totals.netCents).toBe(1800); // 1500 + 800 − 500
    expect(out!.totals.accruedCents).toBe(2300);
    expect(out!.totals.reversedCents).toBe(500);
  });

  it("returns null for an unknown staff id on the drill-down", async () => {
    const out = await loadStaffCommissionDrilldown(dbh.db, {
      staffId: "00000000-0000-0000-0000-000000000000",
      from: "2026-06-01",
      to: "2026-06-07",
    });
    expect(out).toBeNull();
  });
});
