import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, commissionLedger, commissionRunLines, commissionRuns, invoices, parents, staff, users } from "@bm/db";
import { createCommissionRunJob } from "./commission-run.js";

/**
 * P3-E01-S03 — monthly commission run job. DB-backed via PGlite with an injected
 * clock at 02:00 on the 1st. Covers prior-month totals (AC2/AC3), idempotency
 * (AC4), and the audit (AC5).
 */
const NOW = new Date("2026-07-01T02:00:00.000Z"); // closes June 2026

async function seedJune(dbh: TestDb, name: string, amountCents: number, day = 10) {
  const [s] = await dbh.db.insert(staff).values({ displayName: name, role: "stylist" }).returning();
  const [u] = await dbh.db.insert(users).values({ phone: `+2547${Math.floor(Math.random() * 1e8)}`, pinHash: "x" }).returning();
  const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
  const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
  const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, serviceId: null, status: "paid" }).returning();
  const [b] = await dbh.db
    .insert(bookings)
    .values({ parentId: p!.id, childId: c!.id, serviceId: null, staffId: s!.id, staffNameSnapshot: name, staffRateSnapshot: 0, invoiceId: inv!.id })
    .returning();
  await dbh.db.insert(commissionLedger).values({
    staffId: s!.id,
    bookingId: b!.id,
    amountCents,
    rateSnapshot: "10.00",
    source: "booking",
    occurredAt: new Date(`2026-06-${String(day).padStart(2, "0")}T10:00:00Z`),
  });
  return s!.id;
}

describe("monthly commission run job (P3-E01-S03)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const run = () => createCommissionRunJob({ db: dbh.db, now: () => NOW, logger: { info() {} } }).run();

  it("closes the prior month: writes a run + per-staff lines, audited (AC2/AC3/AC5)", async () => {
    const a = await seedJune(dbh, "Asha", 1500);
    const b = await seedJune(dbh, "Bina", 2000);
    await run();

    const runs = await dbh.db.select().from(commissionRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.kind).toBe("monthly");
    expect(runs[0]!.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(runs[0]!.periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(runs[0]!.totalCents).toBe(3500);

    const lines = await dbh.db.select().from(commissionRunLines).where(eq(commissionRunLines.runId, runs[0]!.id));
    expect(lines).toHaveLength(2);
    const byStaff = new Map(lines.map((l) => [l.staffId, l.amountCents]));
    expect(byStaff.get(a)).toBe(1500);
    expect(byStaff.get(b)).toBe(2000);

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.run.created"));
    expect(audits).toHaveLength(1);
  });

  it("is idempotent — running twice for the same month is a no-op (AC4)", async () => {
    await seedJune(dbh, "Asha", 1500);
    await run();
    await run();
    const runs = await dbh.db.select().from(commissionRuns);
    expect(runs).toHaveLength(1); // no duplicate run
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.run.created"));
    expect(audits).toHaveLength(1); // a no-op re-run does not re-audit
  });

  it("declares a monthly cadence + correct name", () => {
    const job = createCommissionRunJob({ db: dbh.db, now: () => NOW });
    expect(job.name).toBe("commission-run");
    expect(job.intervalMs).toBeGreaterThan(0);
  });
});
