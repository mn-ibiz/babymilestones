import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { bookings, children, commissionLedger, commissionRunLines, commissionRuns, invoices, parents, staff, users } from "@bm/db";
import { createCommissionRun, priorMonthPeriod } from "./commission-run.js";

/**
 * P3-E01-S03/S04 — commission run computation. DB-backed via PGlite. Covers
 * per-staff totals (AC2/AC3), idempotent monthly re-run (AC4), and ad-hoc
 * claiming that a later monthly run then excludes (S04 AC3).
 */

async function seedStaff(dbh: TestDb, name: string) {
  const [s] = await dbh.db.insert(staff).values({ displayName: name, role: "stylist" }).returning();
  return s!.id;
}

async function seedLedger(
  dbh: TestDb,
  opts: { staffId: string; amountCents: number; occurredAt: Date; source?: "booking" | "refund_reversal" },
) {
  // Minimal booking graph to satisfy FKs.
  const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
  const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
  const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
  const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, serviceId: null, status: "settled" }).returning();
  const [b] = await dbh.db
    .insert(bookings)
    .values({ parentId: p!.id, childId: c!.id, serviceId: null, staffId: opts.staffId, staffNameSnapshot: "x", staffRateSnapshot: 0, invoiceId: inv!.id })
    .returning();
  await dbh.db.insert(commissionLedger).values({
    staffId: opts.staffId,
    bookingId: b!.id,
    amountCents: opts.amountCents,
    rateSnapshot: "10.00",
    source: opts.source ?? "booking",
    occurredAt: opts.occurredAt,
  });
}

describe("commission run (P3-E01-S03/S04)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("computes per-staff net totals for the period + a run row (AC2/AC3)", async () => {
    const a = await seedStaff(dbh, "Asha");
    const b = await seedStaff(dbh, "Bina");
    await seedLedger(dbh, { staffId: a, amountCents: 1000, occurredAt: new Date("2026-06-10T10:00:00Z") });
    await seedLedger(dbh, { staffId: a, amountCents: 500, occurredAt: new Date("2026-06-20T10:00:00Z") });
    await seedLedger(dbh, { staffId: b, amountCents: 2000, occurredAt: new Date("2026-06-15T10:00:00Z") });
    // Out of period — excluded.
    await seedLedger(dbh, { staffId: a, amountCents: 9999, occurredAt: new Date("2026-07-02T10:00:00Z") });

    const res = await createCommissionRun(dbh.db, {
      kind: "monthly",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
    });
    expect(res.alreadyExisted).toBe(false);
    expect(res.run.totalCents).toBe(3500);
    const byStaff = new Map(res.lines.map((l) => [l.staffId, l.amountCents]));
    expect(byStaff.get(a)).toBe(1500);
    expect(byStaff.get(b)).toBe(2000);
    const lines = await dbh.db.select().from(commissionRunLines).where(eq(commissionRunLines.runId, res.run.id));
    expect(lines).toHaveLength(2);
  });

  it("nets reversals against accruals; a fully-reversed staff has no line", async () => {
    const a = await seedStaff(dbh, "Asha");
    await seedLedger(dbh, { staffId: a, amountCents: 1000, occurredAt: new Date("2026-06-10T10:00:00Z") });
    await seedLedger(dbh, { staffId: a, amountCents: -1000, occurredAt: new Date("2026-06-11T10:00:00Z"), source: "refund_reversal" });
    const res = await createCommissionRun(dbh.db, {
      kind: "monthly",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
    });
    expect(res.run.totalCents).toBe(0);
    expect(res.lines).toHaveLength(0);
  });

  it("is idempotent for a monthly period — a re-run is a no-op (AC4)", async () => {
    const a = await seedStaff(dbh, "Asha");
    await seedLedger(dbh, { staffId: a, amountCents: 1000, occurredAt: new Date("2026-06-10T10:00:00Z") });
    const period = { periodStart: new Date("2026-06-01T00:00:00Z"), periodEnd: new Date("2026-07-01T00:00:00Z") };
    const first = await createCommissionRun(dbh.db, { kind: "monthly", ...period });
    const second = await createCommissionRun(dbh.db, { kind: "monthly", ...period });
    expect(second.alreadyExisted).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    const runs = await dbh.db.select().from(commissionRuns);
    expect(runs).toHaveLength(1); // no duplicate run
  });

  it("claims entries so a later monthly run excludes an ad-hoc period (S04 AC3)", async () => {
    const a = await seedStaff(dbh, "Asha");
    await seedLedger(dbh, { staffId: a, amountCents: 1000, occurredAt: new Date("2026-06-05T10:00:00Z") }); // ad-hoc covers
    await seedLedger(dbh, { staffId: a, amountCents: 700, occurredAt: new Date("2026-06-20T10:00:00Z") }); // after ad-hoc

    // Ad-hoc run for the first half of June.
    const adhoc = await createCommissionRun(dbh.db, {
      kind: "ad_hoc",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-06-15T00:00:00Z"),
    });
    expect(adhoc.run.totalCents).toBe(1000);

    // Month-end run for all of June — must EXCLUDE the already-claimed 1000.
    const monthly = await createCommissionRun(dbh.db, {
      kind: "monthly",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
    });
    expect(monthly.run.totalCents).toBe(700);

    // No unclaimed entries remain in June.
    const unclaimed = await dbh.db.select().from(commissionLedger).where(isNull(commissionLedger.runId));
    expect(unclaimed).toHaveLength(0);
  });
});

describe("priorMonthPeriod (P3-E01-S03 AC2)", () => {
  it("returns the prior calendar month in UTC", () => {
    const { periodStart, periodEnd } = priorMonthPeriod(new Date("2026-07-01T02:00:00Z"));
    expect(periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
  it("handles January → prior December of the previous year", () => {
    const { periodStart, periodEnd } = priorMonthPeriod(new Date("2026-01-01T02:00:00Z"));
    expect(periodStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
