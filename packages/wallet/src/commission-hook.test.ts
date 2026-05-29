import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  auditOutbox,
  bookings,
  children,
  commissionLedger,
  invoices,
  parents,
  staff,
  users,
} from "@bm/db";
import { setCommissionRate } from "@bm/catalog";
import { recordBookingCommission, reverseBookingCommission } from "./commission-hook.js";

/**
 * P3-E01-S02 — commission line recorded on every attributed booking. DB-backed
 * via PGlite. Covers accrual on settle (AC1/AC3), idempotency + append-only
 * (AC4), refund reversal (AC2), and the unattributed / no-rate skips.
 */
const BOOKED_AT = new Date("2026-02-15T10:00:00.000Z");

describe("commission hook (P3-E01-S02)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedBooking(opts: { attributed?: boolean; priceCents?: number; rate?: string } = {}) {
    const [u] = await dbh.db.insert(users).values({ phone: "+254712300001", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, serviceId: null, status: "paid" }).returning();
    let staffId: string | null = null;
    if (opts.attributed !== false) {
      const [s] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
      staffId = s!.id;
      if (opts.rate !== undefined) {
        await setCommissionRate(dbh.db, { staffId, ratePercent: opts.rate, effectiveFrom: new Date("2026-01-01T00:00:00Z") });
      }
    }
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: p!.id,
        childId: c!.id,
        serviceId: null,
        staffId,
        staffNameSnapshot: "Asha",
        staffRateSnapshot: opts.priceCents ?? 10000, // service price in cents
        invoiceId: inv!.id,
        createdAt: BOOKED_AT,
      })
      .returning();
    return { bookingId: b!.id, staffId };
  }

  it("writes one accrual = price × rate at booking time, in integer cents (AC1/AC3)", async () => {
    const { bookingId, staffId } = await seedBooking({ priceCents: 10000, rate: "12.50" });
    const res = await recordBookingCommission(dbh.db, { bookingId, postedBy: "actor-1" });
    expect(res.entry).not.toBeNull();
    expect(res.entry!.amountCents).toBe(1250); // 12.5% of 100.00
    expect(res.entry!.staffId).toBe(staffId);
    expect(res.entry!.source).toBe("booking");
    expect(res.entry!.rateSnapshot).toBe("12.50");
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.ledger.posted"));
    expect(audits).toHaveLength(1);
  });

  it("is idempotent — a second call writes no new accrual (AC4 / re-run safe)", async () => {
    const { bookingId } = await seedBooking({ rate: "10.00" });
    const first = await recordBookingCommission(dbh.db, { bookingId });
    const second = await recordBookingCommission(dbh.db, { bookingId });
    expect(second.replayed).toBe(true);
    expect(second.entry!.id).toBe(first.entry!.id);
    const rows = await dbh.db.select().from(commissionLedger).where(eq(commissionLedger.bookingId, bookingId));
    expect(rows).toHaveLength(1);
  });

  it("skips an unattributed booking (no staff)", async () => {
    const { bookingId } = await seedBooking({ attributed: false });
    const res = await recordBookingCommission(dbh.db, { bookingId });
    expect(res.entry).toBeNull();
    expect(res.skipped).toBe("unattributed");
    const rows = await dbh.db.select().from(commissionLedger);
    expect(rows).toHaveLength(0);
  });

  it("skips when the staff member has no rate in force at booking time", async () => {
    const { bookingId } = await seedBooking({ attributed: true }); // no rate set
    const res = await recordBookingCommission(dbh.db, { bookingId });
    expect(res.skipped).toBe("no_rate");
  });

  it("reverses the accrual with a signed-opposite append-only row on refund (AC2/AC4)", async () => {
    const { bookingId } = await seedBooking({ priceCents: 10000, rate: "12.50" });
    const accrual = await recordBookingCommission(dbh.db, { bookingId });
    const rev = await reverseBookingCommission(dbh.db, { bookingId, postedBy: "actor-1" });
    expect(rev.entry).not.toBeNull();
    expect(rev.entry!.amountCents).toBe(-1250);
    expect(rev.entry!.source).toBe("refund_reversal");
    expect(rev.entry!.reversesEntryId).toBe(accrual.entry!.id);

    // Append-only: original untouched; net = 0.
    const rows = await dbh.db.select().from(commissionLedger).where(eq(commissionLedger.bookingId, bookingId));
    expect(rows).toHaveLength(2);
    const net = rows.reduce((s, r) => s + r.amountCents, 0);
    expect(net).toBe(0);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.ledger.reversed"));
    expect(audits).toHaveLength(1);
  });

  it("reversal is idempotent and skips when there is no accrual", async () => {
    const { bookingId } = await seedBooking({ rate: "10.00" });
    await recordBookingCommission(dbh.db, { bookingId });
    const r1 = await reverseBookingCommission(dbh.db, { bookingId });
    const r2 = await reverseBookingCommission(dbh.db, { bookingId });
    expect(r2.replayed).toBe(true);
    expect(r2.entry!.id).toBe(r1.entry!.id);
    const reversals = await dbh.db
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.bookingId, bookingId), eq(commissionLedger.source, "refund_reversal")));
    expect(reversals).toHaveLength(1);

    const { bookingId: other } = await seedBooking({ attributed: false });
    const none = await reverseBookingCommission(dbh.db, { bookingId: other });
    expect(none.skipped).toBe("no_accrual");
  });
});
