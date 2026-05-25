import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, walletLedger } from "@bm/db";
import { recentTransactions, RECENT_TRANSACTIONS_LIMIT } from "./recent.js";

/**
 * P1-E05-S05 — recent-transactions ledger read helper. Returns the latest N
 * ledger postings for one wallet, newest-first, each carrying the running
 * balance *after* that posting (cumulative SUM up to and including it — the same
 * "balance is computed, never stored" rule as the statement). Test-first:
 * ordering/limit, balance-after, fields, empty case.
 */
describe("wallet recentTransactions (P1-E05-S05)", () => {
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
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25471${String(5000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  async function postEntry(
    walletId: string,
    amount: number,
    kind: string,
    direction: string,
    source: string,
    key: string,
    createdAt: Date,
  ) {
    await dbh.db.insert(walletLedger).values({
      walletId,
      amount,
      direction,
      kind,
      idempotencyKey: key,
      postedBy: "system",
      source,
      createdAt,
    });
  }

  it("returns newest-first, capped at the limit (AC1)", async () => {
    const walletId = await seedWallet();
    // 12 credits of 1000 cents, oldest → newest.
    for (let i = 0; i < 12; i += 1) {
      await postEntry(
        walletId,
        1_000,
        "topup",
        "credit",
        "cash:reception",
        `k-${i}`,
        new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
      );
    }

    const rows = await recentTransactions(dbh.db, walletId);
    expect(rows).toHaveLength(RECENT_TRANSACTIONS_LIMIT);
    // Newest first: the Jan 12 entry leads.
    expect(rows[0]!.createdAt).toBe("2026-01-12T00:00:00.000Z");
    expect(rows.at(-1)!.createdAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("carries the running balance after each entry (AC1)", async () => {
    const walletId = await seedWallet();
    await postEntry(
      walletId,
      50_000,
      "topup",
      "credit",
      "cash:reception",
      "k-a",
      new Date("2026-02-01T00:00:00.000Z"),
    );
    await postEntry(
      walletId,
      -20_000,
      "debit",
      "debit",
      "checkin",
      "k-b",
      new Date("2026-02-02T00:00:00.000Z"),
    );
    await postEntry(
      walletId,
      5_000,
      "topup",
      "credit",
      "cash:reception",
      "k-c",
      new Date("2026-02-03T00:00:00.000Z"),
    );

    const rows = await recentTransactions(dbh.db, walletId);
    // Newest first: +5000 → balance 35000; -20000 → 30000; +50000 → 50000.
    expect(rows.map((r) => r.amountCents)).toEqual([5_000, -20_000, 50_000]);
    expect(rows.map((r) => r.balanceAfterCents)).toEqual([35_000, 30_000, 50_000]);
  });

  it("balance-after of the newest row equals the full wallet balance", async () => {
    const walletId = await seedWallet();
    for (let i = 0; i < 15; i += 1) {
      await postEntry(
        walletId,
        2_000,
        "topup",
        "credit",
        "cash:reception",
        `b-${i}`,
        new Date(`2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
      );
    }
    const rows = await recentTransactions(dbh.db, walletId);
    // 15 * 2000 = 30000 total; the newest (first) row's balance-after is the full balance.
    expect(rows[0]!.balanceAfterCents).toBe(30_000);
  });

  it("exposes date, kind, amount, source per entry (fields)", async () => {
    const walletId = await seedWallet();
    await postEntry(
      walletId,
      7_500,
      "refund",
      "credit",
      "admin",
      "k-fields",
      new Date("2026-04-01T12:00:00.000Z"),
    );
    const [row] = await recentTransactions(dbh.db, walletId);
    expect(row).toMatchObject({
      kind: "refund",
      amountCents: 7_500,
      source: "admin",
      createdAt: "2026-04-01T12:00:00.000Z",
    });
    expect(typeof row!.id).toBe("string");
  });

  it("empty ledger → empty list (empty case)", async () => {
    const walletId = await seedWallet();
    expect(await recentTransactions(dbh.db, walletId)).toEqual([]);
  });

  it("honours a custom limit", async () => {
    const walletId = await seedWallet();
    for (let i = 0; i < 5; i += 1) {
      await postEntry(
        walletId,
        1_000,
        "topup",
        "credit",
        "cash:reception",
        `c-${i}`,
        new Date(`2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
      );
    }
    const rows = await recentTransactions(dbh.db, walletId, { limit: 3 });
    expect(rows).toHaveLength(3);
  });
});
