import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { floatAccounts, users, wallets } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { floatLiabilities, post } from "./index.js";

/**
 * P1-E06-S02 AC2 — system-tracked float liability per account. The system
 * balance is `opening_balance + SUM(wallet_ledger.amount)` grouped by
 * `float_account_id`, computed from the ledger (never stored).
 */
describe("wallet floatLiabilities (P1-E06-S02)", () => {
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

  it("sums ledger movements per float account + opening balance (AC2)", async () => {
    const [till] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Till", kind: "mpesa_till", openingBalance: 10_000, openingDate: "2026-05-25" })
      .returning();
    const [bank] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Bank", kind: "bank", openingDate: "2026-05-25" })
      .returning();

    const walletId = await seedWallet();
    // Till: +50_000 then a -5_000 debit → ledger 45_000, plus opening 10_000 = 55_000.
    await post(dbh.db, {
      walletId,
      amount: 50_000,
      kind: "topup",
      idempotencyKey: "k1",
      source: "mpesa",
      postedBy: "system",
      floatAccountId: till!.id,
    });
    await post(dbh.db, {
      walletId,
      amount: -5_000,
      kind: "debit",
      idempotencyKey: "k2",
      source: "checkin",
      postedBy: "system",
      floatAccountId: till!.id,
    });
    // Bank: a single +20_000 top-up, opening 0 → 20_000.
    await post(dbh.db, {
      walletId,
      amount: 20_000,
      kind: "topup",
      idempotencyKey: "k3",
      source: "paystack",
      postedBy: "system",
      floatAccountId: bank!.id,
    });

    const liab = await floatLiabilities(dbh.db);
    const byId = new Map(liab.map((l) => [l.floatAccountId, l]));
    expect(byId.get(till!.id)!.systemCents).toBe(55_000);
    expect(byId.get(bank!.id)!.systemCents).toBe(20_000);
  });

  it("returns accounts with no tagged movements at their opening balance", async () => {
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Empty", kind: "cash_drawer", openingBalance: 7_500, openingDate: "2026-05-25" });
    const [row] = await floatLiabilities(dbh.db);
    expect(row!.systemCents).toBe(7_500);
  });

  it("includes inactive accounts so historical drift still surfaces", async () => {
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Old", kind: "bank", openingBalance: 100, openingDate: "2026-05-25", active: false });
    const liab = await floatLiabilities(dbh.db);
    expect(liab).toHaveLength(1);
    expect(liab[0]!.active).toBe(false);
  });

  it("does not double-count: untagged ledger rows are excluded", async () => {
    const [acct] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Till", kind: "mpesa_till", openingDate: "2026-05-25" })
      .returning();
    const walletId = await seedWallet();
    // Untagged top-up (floatAccountId null) must NOT inflate any account.
    await post(dbh.db, {
      walletId,
      amount: 99_999,
      kind: "topup",
      idempotencyKey: "untagged",
      source: "mpesa",
      postedBy: "system",
    });
    const [row] = await floatLiabilities(dbh.db);
    expect(row!.floatAccountId).toBe(acct!.id);
    expect(row!.systemCents).toBe(0);
  });
});
