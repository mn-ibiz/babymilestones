import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  invoices,
  parents,
  services,
  users,
  wallets,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import { loadRevenueByPeriod } from "./revenue-by-period-db.js";

/**
 * P3-E05-S02 (Story 27.2) — DB read behind the revenue-by-unit-by-period report.
 * DB-backed via the PGlite harness. Verifies the read sums per-unit booking
 * revenue over the `[from, to]` range (keyed on `checkedInAt`), subtracts refunds
 * attributed to each unit (NET revenue, AC3), and computes the delta against the
 * immediately-preceding equal-length period (AC1).
 */
describe("loadRevenueByPeriod (Story 27.2)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25472${String(1_000_000 + phoneSeq++).padStart(7, "0")}`;

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
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return { parentId: p!.id, childId: c!.id, walletId: w!.id };
  }

  /** Insert a booking (+ its 1:1 invoice) checked in at `at`. Returns booking + invoice id. */
  async function seedBooking(opts: {
    parentId: string;
    childId: string;
    serviceId: string | null;
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
        staffNameSnapshot: "Staff",
        staffRateSnapshot: opts.revenueCents,
        invoiceId: inv!.id,
        status: opts.status ?? "confirmed",
        checkedInAt: opts.checkedInAt,
      })
      .returning();
    return { bookingId: b!.id, invoiceId: inv!.id };
  }

  /** Record a check-in debit ledger entry settling `invoiceId`, then a refund of `refundCents` at `refundAt`. */
  async function seedRefund(opts: {
    walletId: string;
    invoiceId: string;
    debitCents: number;
    refundCents: number;
    refundAt: Date;
    keyPrefix: string;
  }) {
    const [debit] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId: opts.walletId,
        amount: -opts.debitCents,
        direction: "debit",
        kind: "debit",
        idempotencyKey: `${opts.keyPrefix}:debit`,
        postedBy: "system",
        source: "checkin",
      })
      .returning();
    await dbh.db.insert(walletLedgerInvoiceSettlement).values({
      ledgerEntryId: debit!.id,
      invoiceId: opts.invoiceId,
      amount: opts.debitCents,
      kind: "checkin",
    });
    await dbh.db.insert(walletLedger).values({
      walletId: opts.walletId,
      amount: opts.refundCents,
      direction: "credit",
      kind: "refund",
      idempotencyKey: `${opts.keyPrefix}:refund`,
      postedBy: "admin",
      source: "admin",
      reversesEntryId: debit!.id,
      createdAt: opts.refundAt,
    });
  }

  it("sums per-unit booking revenue over the range, refunds netted (AC1/AC3)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();

    // In-range play bookings (2000 + 1500) and a salon booking (5000).
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 2000, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 1500, checkedInAt: new Date("2026-06-05T10:00:00Z") });
    const salonBk = await seedBooking({ ...fam, serviceId: salon!.id, revenueCents: 5000, checkedInAt: new Date("2026-06-06T10:00:00Z") });
    // A cancelled booking in range — excluded.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 9999, checkedInAt: new Date("2026-06-04T10:00:00Z"), status: "cancelled" });
    // A booking OUTSIDE the range — excluded.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 7777, checkedInAt: new Date("2026-07-01T10:00:00Z") });

    // Refund 1000 against the salon booking, dated inside the range.
    await seedRefund({ walletId: fam.walletId, invoiceId: salonBk.invoiceId, debitCents: 5000, refundCents: 1000, refundAt: new Date("2026-06-07T09:00:00Z"), keyPrefix: "s" });

    const out = await loadRevenueByPeriod(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    const byUnit = Object.fromEntries(out.byUnit.map((u) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(3500); // 2000 + 1500; cancelled + out-of-range excluded
    expect(byUnit.salon).toBe(4000); // 5000 − 1000 refund
    expect(byUnit.talent).toBe(0);
    expect(out.totalCents).toBe(7500); // 3500 + 4000
  });

  it("computes the period-over-period delta against the preceding equal-length period (AC1)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();

    // Current period 06-08..06-14: 3000 play.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 3000, checkedInAt: new Date("2026-06-10T10:00:00Z") });
    // Previous period 06-01..06-07: 1000 play.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 1000, checkedInAt: new Date("2026-06-03T10:00:00Z") });

    const out = await loadRevenueByPeriod(dbh.db, { from: "2026-06-08", to: "2026-06-14" });
    expect(out.totalCents).toBe(3000);
    expect(out.previousTotalCents).toBe(1000);
    expect(out.totalDeltaCents).toBe(2000);
    const deltaByUnit = Object.fromEntries(out.deltaByUnit.map((u) => [u.unit, u.deltaCents]));
    expect(deltaByUnit.play).toBe(2000);
  });

  it("an empty range returns zeroed units + total (AC1)", async () => {
    const out = await loadRevenueByPeriod(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    expect(out.totalCents).toBe(0);
    expect(out.byUnit).toHaveLength(5);
    expect(out.byUnit.every((u) => u.revenueCents === 0)).toBe(true);
    expect(out.previousTotalCents).toBe(0);
  });

  it("refunds only count when the refund itself falls inside the period (AC3)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();
    const bk = await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 4000, checkedInAt: new Date("2026-06-03T10:00:00Z") });
    // Refund dated AFTER the range — must not net down this period's revenue.
    await seedRefund({ walletId: fam.walletId, invoiceId: bk.invoiceId, debitCents: 4000, refundCents: 1000, refundAt: new Date("2026-06-20T09:00:00Z"), keyPrefix: "p" });

    const out = await loadRevenueByPeriod(dbh.db, { from: "2026-06-01", to: "2026-06-07" });
    const byUnit = Object.fromEntries(out.byUnit.map((u) => [u.unit, u.revenueCents]));
    expect(byUnit.play).toBe(4000); // refund is out-of-range → not subtracted
  });
});
