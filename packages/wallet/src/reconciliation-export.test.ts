import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { floatAccounts, reconciliationAdjustments, users, walletLedger, wallets } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { reconciliationExportRows } from "./index.js";

/**
 * P1-E06-S04 — per-day-per-account export read model. For each calendar day in
 * the inclusive range, each float account yields one row: ledger-derived system
 * balance as of end-of-day, real balance (system corrected by cumulative
 * approved adjustments through the day), drift (system − real), and the net
 * approved adjustments dated that very day.
 *
 * Ledger rows are inserted directly (with an explicit `createdAt`) so each test
 * can pin a movement to a specific UTC day — `post()` always stamps now().
 */
describe("wallet reconciliationExportRows (P1-E06-S04)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedWallet(): Promise<string> {
    seq += 1;
    const phone = `+25471${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  async function seedTill(opening = 0) {
    const [t] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Till", kind: "mpesa_till", openingBalance: opening, openingDate: "2026-05-01" })
      .returning();
    return t!.id;
  }

  async function tagged(walletId: string, floatAccountId: string, amount: number, day: string, key: string) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction: amount >= 0 ? "credit" : "debit",
      kind: amount >= 0 ? "topup" : "debit",
      idempotencyKey: key,
      source: "mpesa",
      postedBy: "system",
      floatAccountId,
      createdAt: new Date(`${day}T08:00:00Z`),
    });
  }

  it("emits one row per day per account with cumulative system balance (AC2)", async () => {
    const tillId = await seedTill(10_000);
    const walletId = await seedWallet();
    await tagged(walletId, tillId, 50_000, "2026-05-01", "k1");
    await tagged(walletId, tillId, 5_000, "2026-05-02", "k2");

    const rows = await reconciliationExportRows(dbh.db, {
      fromDate: "2026-05-01",
      toDate: "2026-05-03",
    });
    const till = rows.filter((r) => r.floatAccountId === tillId);
    expect(till).toHaveLength(3);
    // Day 1: opening 10_000 + 50_000 = 60_000.
    expect(till[0]!).toMatchObject({ date: "2026-05-01", systemCents: 60_000 });
    // Day 2: cumulative + 5_000 = 65_000.
    expect(till[1]!).toMatchObject({ date: "2026-05-02", systemCents: 65_000 });
    // Day 3: no new movement, balance carries.
    expect(till[2]!).toMatchObject({ date: "2026-05-03", systemCents: 65_000 });
  });

  it("ignores movements after the requested day (as-of-day cut-off)", async () => {
    const tillId = await seedTill();
    const walletId = await seedWallet();
    await tagged(walletId, tillId, 20_000, "2026-05-05", "late");
    const rows = await reconciliationExportRows(dbh.db, {
      fromDate: "2026-05-01",
      toDate: "2026-05-01",
    });
    expect(rows.find((r) => r.floatAccountId === tillId)!.systemCents).toBe(0);
  });

  it("computes real balance + drift from cumulative approved adjustments (AC2)", async () => {
    const tillId = await seedTill();
    const walletId = await seedWallet();
    await tagged(walletId, tillId, 100_000, "2026-05-01", "k1");
    const [poster] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000001", pinHash: "x" })
      .returning();
    const [approver] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000002", pinHash: "x" })
      .returning();
    // An approved -3_000 adjustment dated day 2 (real is 3_000 below system).
    await dbh.db.insert(reconciliationAdjustments).values({
      floatAccountId: tillId,
      amount: -3_000,
      reason: "cash short",
      postedBy: poster!.id,
      approvedBy: approver!.id,
      status: "approved",
      createdAt: new Date("2026-05-02T10:00:00Z"),
    });
    // A pending adjustment must NOT affect the figures.
    await dbh.db.insert(reconciliationAdjustments).values({
      floatAccountId: tillId,
      amount: -9_999,
      reason: "pending, ignore me",
      postedBy: poster!.id,
      status: "pending",
      createdAt: new Date("2026-05-02T11:00:00Z"),
    });

    const rows = await reconciliationExportRows(dbh.db, {
      fromDate: "2026-05-01",
      toDate: "2026-05-03",
    });
    const till = rows.filter((r) => r.floatAccountId === tillId);
    // Day 1: no adjustments yet.
    expect(till[0]!).toMatchObject({
      systemCents: 100_000,
      realCents: 100_000,
      driftCents: 0,
      adjustmentsCents: 0,
    });
    // Day 2: -3_000 approved adjustment applied this day.
    expect(till[1]!).toMatchObject({
      systemCents: 100_000,
      realCents: 97_000,
      driftCents: 3_000,
      adjustmentsCents: -3_000,
    });
    // Day 3: adjustment carries into real/drift, but adjustmentsCents (that-day) is 0.
    expect(till[2]!).toMatchObject({
      systemCents: 100_000,
      realCents: 97_000,
      driftCents: 3_000,
      adjustmentsCents: 0,
    });
  });

  it("includes inactive accounts and accounts with no movement", async () => {
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Old", kind: "bank", openingBalance: 2_500, openingDate: "2026-05-01", active: false });
    const rows = await reconciliationExportRows(dbh.db, {
      fromDate: "2026-05-01",
      toDate: "2026-05-01",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ account: "Old", systemCents: 2_500, realCents: 2_500 });
  });
});
