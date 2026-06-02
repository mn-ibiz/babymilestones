import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { attendances, bookings, children, invoices, parents, services, users } from "@bm/db";
import { loadPeakHoursHeatmap } from "./peak-hours-heatmap-db.js";

/**
 * P3-E05-S05 (Story 27.5) — DB read behind the peak-hours heatmap. DB-backed via
 * the PGlite harness. Verifies the read counts active sessions (attendance
 * check-ins) bucketed by UTC weekday × hour over the `[from, to]` range, joins each
 * attendance → its booking → service → unit, and narrows to a single unit when the
 * filter is supplied (AC2). Boundaries are UTC `[from 00:00, (to+1) 00:00)` keyed
 * on `attendances.checkedInAt`.
 */
describe("loadPeakHoursHeatmap (Story 27.5)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25471${String(3_000_000 + phoneSeq++).padStart(7, "0")}`;

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

  /** Seed a booking + a matching attendance check-in at `checkedInAt`. */
  async function seedSession(opts: {
    parentId: string;
    childId: string;
    serviceId: string | null;
    checkedInAt: Date;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: 0, serviceId: opts.serviceId })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: opts.parentId,
        childId: opts.childId,
        serviceId: opts.serviceId,
        staffNameSnapshot: "Staff",
        staffRateSnapshot: 0,
        invoiceId: inv!.id,
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    await dbh.db
      .insert(attendances)
      .values({ bookingId: b!.id, checkedInAt: opts.checkedInAt });
  }

  it("counts sessions by UTC weekday × hour over the range (AC1)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    // Two on Wed (3) 10:00, one on Thu (4) 15:00 — all in range.
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:05:00Z") });
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:45:00Z") });
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-04T15:00:00Z") });
    // Out of range — excluded.
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-07-01T10:00:00Z") });

    const out = await loadPeakHoursHeatmap(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    expect(out.cells[3]![10]).toBe(2);
    expect(out.cells[4]![15]).toBe(1);
    expect(out.totalSessions).toBe(3);
    // A complete zero-filled 7×24 grid.
    expect(out.cells).toHaveLength(7);
    expect(out.cells.every((r) => r.length === 24)).toBe(true);
  });

  it("narrows to a single unit when the filter is supplied (AC2)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();
    await seedSession({ ...fam, serviceId: play!.id, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedSession({ ...fam, serviceId: salon!.id, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const all = await loadPeakHoursHeatmap(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    expect(all.cells[3]![10]).toBe(2);
    expect(all.totalSessions).toBe(2);

    const salonOnly = await loadPeakHoursHeatmap(dbh.db, {
      from: "2026-06-01",
      to: "2026-06-07",
      unit: "salon",
    });
    expect(salonOnly.cells[3]![10]).toBe(1);
    expect(salonOnly.totalSessions).toBe(1);
  });

  it("an empty range returns a zero-filled grid (AC1)", async () => {
    const out = await loadPeakHoursHeatmap(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    expect(out.totalSessions).toBe(0);
    expect(out.cells.flat().every((c) => c === 0)).toBe(true);
    expect(out.peak).toBeNull();
  });
});
