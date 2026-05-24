import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { users, wallets, walletLedger } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { balance, balances } from "./index.js";

describe("wallet balance — computed, never stored (P1-E03-S02)", () => {
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

  function entry(walletId: string, amount: number, key: string) {
    const credit = amount >= 0;
    return {
      walletId,
      amount,
      direction: credit ? ("credit" as const) : ("debit" as const),
      kind: credit ? ("topup" as const) : ("debit" as const),
      idempotencyKey: key,
      postedBy: "system",
      source: "test",
    };
  }

  it("returns 0 for a wallet with no postings (AC1)", async () => {
    const walletId = await seedWallet();
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  it("sums a known set of postings → expected integer cents (AC1)", async () => {
    const walletId = await seedWallet();
    await dbh.db.insert(walletLedger).values([
      entry(walletId, 150_000, "k1"), // +1,500.00
      entry(walletId, -50_000, "k2"), // -500.00
      entry(walletId, 25_000, "k3"), // +250.00
    ]);
    const result = await balance(dbh.db, walletId);
    expect(result).toBe(125_000);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("isolates balance per wallet (AC1)", async () => {
    const a = await seedWallet();
    const b = await seedWallet();
    await dbh.db.insert(walletLedger).values([
      entry(a, 10_000, "a1"),
      entry(b, 99_000, "b1"),
    ]);
    expect(await balance(dbh.db, a)).toBe(10_000);
    expect(await balance(dbh.db, b)).toBe(99_000);
  });

  it("property: 1000 random signed postings → balance equals naive sum (AC4)", async () => {
    const walletId = await seedWallet();
    // Deterministic LCG PRNG so the property test is reproducible without deps.
    let state = 1234567;
    const rand = () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };

    let naive = 0;
    const rows = [] as ReturnType<typeof entry>[];
    for (let i = 0; i < 1000; i += 1) {
      // Random signed cents in [-1_000_000, 1_000_000], never zero-amount.
      let amount = Math.round((rand() * 2 - 1) * 1_000_000);
      if (amount === 0) amount = 1;
      naive += amount;
      rows.push(entry(walletId, amount, `p${i}`));
    }
    // Insert in chunks to stay well within parameter limits.
    for (let i = 0; i < rows.length; i += 200) {
      await dbh.db.insert(walletLedger).values(rows.slice(i, i + 200));
    }

    const computed = await balance(dbh.db, walletId);
    expect(computed).toBe(naive);
    expect(Number.isInteger(computed)).toBe(true);
  });

  it("balances(): batched SUM per wallet, missing wallets omitted (AC1)", async () => {
    const a = await seedWallet();
    const b = await seedWallet();
    const empty = await seedWallet();
    await dbh.db.insert(walletLedger).values([
      entry(a, 30_000, "ba1"),
      entry(a, -10_000, "ba2"),
      entry(b, 5_000, "bb1"),
    ]);
    const map = await balances(dbh.db, [a, b, empty]);
    expect(map.get(a)).toBe(20_000);
    expect(map.get(b)).toBe(5_000);
    expect(map.has(empty)).toBe(false);
    expect(await balances(dbh.db, [])).toEqual(new Map());
  });

  it("there is no wallets.balance column — balance is never stored (AC2)", async () => {
    const res = await dbh.pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'wallets'`,
    );
    const columns = res.rows.map((r) => r.column_name);
    expect(columns).not.toContain("balance");
  });

  it("the (wallet_id, created_at DESC) index exists (AC3)", async () => {
    const res = await dbh.pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'wallet_ledger'`,
    );
    const names = res.rows.map((r) => r.indexname);
    expect(names).toContain("wallet_ledger_wallet_id_created_at_idx");
  });
});
