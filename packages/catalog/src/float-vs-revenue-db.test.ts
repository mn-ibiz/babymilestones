import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bookings,
  children,
  floatAccounts,
  invoices,
  parents,
  services,
  users,
  wallets,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { loadFloatVsRevenue } from "./float-vs-revenue-db.js";

/**
 * P5-E05-S04 (Story 35.4) — DB read behind the float-vs-revenue report. An
 * ON-THE-FLY read model (no snapshot table): every figure is reconstructed from
 * the append-only `wallet_ledger` + the static `float_accounts.opening_balance` +
 * the Epic 27 daily-revenue source, evaluated as-of each day in `[from, to]`.
 *
 *  - wallet liability as-of each day  = Σ ALL wallet_ledger.amount ≤ end-of-day
 *  - segregated balance as-of each day = Σ float openings + Σ float-tagged ledger ≤ day
 *  - revenue that day                  = Σ non-cancelled booking staffRateSnapshot
 *                                        (net of in-day refunds), keyed by checkedInAt
 */
describe("loadFloatVsRevenue (Story 35.4)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const at = (day: string, hh = "12") => new Date(`${day}T${hh}:00:00.000Z`);

  let seq = 0;
  async function seedWallet(): Promise<string> {
    seq += 1;
    const phone = `+25471${String(1_000_000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  let keySeq = 0;
  async function ledger(
    walletId: string,
    amount: number,
    createdAt: Date,
    opts: { floatAccountId?: string; kind?: string; reversesEntryId?: string } = {},
  ): Promise<string> {
    keySeq += 1;
    const credit = amount >= 0;
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount,
        direction: credit ? "credit" : "debit",
        kind: opts.kind ?? (credit ? "topup" : "debit"),
        idempotencyKey: `k${keySeq}`,
        postedBy: "system",
        source: "test",
        createdAt,
        floatAccountId: opts.floatAccountId ?? null,
        reversesEntryId: opts.reversesEntryId ?? null,
      })
      .returning();
    return row!.id;
  }

  it("computes the wallet-liability running total as-of each day from the ledger (AC1)", async () => {
    const w = await seedWallet();
    // Day 1: +50_000. Day 2: −20_000 debit. Day 3: nothing.
    await ledger(w, 50_000, at("2026-06-01"));
    await ledger(w, -20_000, at("2026-06-02"), { kind: "debit" });

    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-03", days: 3 });
    const byDay = Object.fromEntries(out.series.map((p) => [p.date, p.walletLiabilityCents]));
    expect(byDay["2026-06-01"]).toBe(50_000);
    expect(byDay["2026-06-02"]).toBe(30_000); // carries forward
    expect(byDay["2026-06-03"]).toBe(30_000); // no movement → unchanged
    expect(out.snapshot.walletLiabilityCents).toBe(30_000);
  });

  it("includes pre-window movements in the as-of-day balance (carry-in)", async () => {
    const w = await seedWallet();
    await ledger(w, 99_000, at("2026-05-20")); // before the window
    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 2 });
    expect(out.series[0]!.walletLiabilityCents).toBe(99_000);
    expect(out.series[1]!.walletLiabilityCents).toBe(99_000);
  });

  it("derives the prior-day delta from the liability change (AC1)", async () => {
    const w = await seedWallet();
    await ledger(w, 50_000, at("2026-06-01"));
    await ledger(w, 12_000, at("2026-06-02"));
    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 2 });
    // 2026-06-02 liability 62_000, prior day 50_000 → +12_000.
    expect(out.snapshot.priorDayDeltaCents).toBe(12_000);
  });

  it("computes the segregated (float-account) balance as-of each day (AC1)", async () => {
    const w = await seedWallet();
    const [bank] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Bank", kind: "bank", openingBalance: 10_000, openingDate: "2026-05-25" })
      .returning();
    // Opening 10_000; +40_000 tagged day 1; −5_000 tagged day 2.
    await ledger(w, 40_000, at("2026-06-01"), { floatAccountId: bank!.id });
    await ledger(w, -5_000, at("2026-06-02"), { floatAccountId: bank!.id, kind: "debit" });
    // An UNTAGGED top-up must NOT move the segregated balance.
    await ledger(w, 77_000, at("2026-06-01"));

    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 2 });
    const byDay = Object.fromEntries(out.series.map((p) => [p.date, p.segregatedBalanceCents]));
    expect(byDay["2026-06-01"]).toBe(50_000); // 10_000 + 40_000
    expect(byDay["2026-06-02"]).toBe(45_000); // − 5_000
    expect(out.snapshot.segregatedBalanceCents).toBe(45_000);
  });

  it("counts a float account's opening balance even with no tagged movements", async () => {
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Drawer", kind: "cash_drawer", openingBalance: 7_500, openingDate: "2026-05-25" });
    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 1 });
    expect(out.snapshot.segregatedBalanceCents).toBe(7_500);
  });

  it("computes revenue earned that day from non-cancelled bookings (AC1)", async () => {
    const [u] = await dbh.db.insert(users).values({ phone: "+254790000001", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Ann", lastName: "Aye" }).returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    const [svc] = await dbh.db
      .insert(services)
      .values({ name: "Play", unit: "play" })
      .returning();
    const seedBooking = async (status: string, rate: number, day: string) => {
      const [inv] = await dbh.db
        .insert(invoices)
        .values({ parentId: p!.id, amountDue: rate })
        .returning();
      await dbh.db.insert(bookings).values({
        parentId: p!.id,
        childId: c!.id,
        serviceId: svc!.id,
        staffNameSnapshot: "Staff",
        staffRateSnapshot: rate,
        invoiceId: inv!.id,
        status,
        checkedInAt: at(day),
      });
    };
    // Two bookings on 2026-06-02, one on 2026-06-01; one cancelled (excluded).
    await seedBooking("confirmed", 1_000, "2026-06-02");
    await seedBooking("confirmed", 2_500, "2026-06-02");
    await seedBooking("confirmed", 9_999, "2026-06-01");
    await seedBooking("cancelled", 5_000, "2026-06-02");

    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 2 });
    const byDay = Object.fromEntries(out.series.map((p) => [p.date, p.revenueCents]));
    expect(byDay["2026-06-01"]).toBe(9_999);
    expect(byDay["2026-06-02"]).toBe(3_500); // 1_000 + 2_500, cancelled excluded
    expect(out.snapshot.revenueCents).toBe(3_500);
  });

  it("nets in-day refunds out of that day's revenue (AC1, Epic 27 source)", async () => {
    const [u] = await dbh.db.insert(users).values({ phone: "+254790000002", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Bea", lastName: "Bee" }).returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    const [svc] = await dbh.db
      .insert(services)
      .values({ name: "Salon", unit: "salon" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: p!.id, amountDue: 0, status: "settled" })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: p!.id,
      childId: c!.id,
      serviceId: svc!.id,
      staffNameSnapshot: "Staff",
      status: "confirmed",
      staffRateSnapshot: 5_000,
      checkedInAt: at("2026-06-02"),
      invoiceId: inv!.id,
    });
    const w = await seedWallet();
    // The original check-in debit that settled the invoice.
    const debitId = await ledger(w, -5_000, at("2026-06-02"), { kind: "debit" });
    await dbh.db.insert(walletLedgerInvoiceSettlement).values({
      ledgerEntryId: debitId,
      invoiceId: inv!.id,
      kind: "checkin",
      amount: 5_000,
    });
    // A same-day refund reverses that debit → nets 2_000 off the day's revenue.
    await ledger(w, 2_000, at("2026-06-02"), { kind: "refund", reversesEntryId: debitId });

    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 1 });
    expect(out.snapshot.revenueCents).toBe(3_000); // 5_000 − 2_000
  });

  it("assembles a full 90-day window ascending (AC2)", async () => {
    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 90 });
    expect(out.series).toHaveLength(90);
    expect(out.from).toBe("2026-03-05");
    expect(out.to).toBe("2026-06-02");
    expect(out.series[0]!.date).toBe("2026-03-05");
    expect(out.series[89]!.date).toBe("2026-06-02");
  });

  it("an empty DB yields a zeroed snapshot + zero-filled series", async () => {
    const out = await loadFloatVsRevenue(dbh.db, { to: "2026-06-02", days: 3 });
    expect(out.series).toHaveLength(3);
    expect(out.series.every((p) => p.walletLiabilityCents === 0 && p.segregatedBalanceCents === 0 && p.revenueCents === 0)).toBe(true);
    expect(out.snapshot).toMatchObject({
      walletLiabilityCents: 0,
      segregatedBalanceCents: 0,
      revenueCents: 0,
      priorDayDeltaCents: 0,
    });
  });
});
