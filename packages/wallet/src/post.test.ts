import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { users, wallets, walletLedger } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { post, IdempotencyConflict, balance } from "./index.js";

describe("wallet.post() — idempotent posting interface (P1-E03-S03)", () => {
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

  function topup(walletId: string, key: string, amount = 100_000) {
    return {
      walletId,
      amount,
      kind: "topup" as const,
      idempotencyKey: key,
      source: "mpesa",
      postedBy: "system",
    };
  }

  it("inserts one ledger row and returns it (AC1)", async () => {
    const walletId = await seedWallet();
    const row = await post(dbh.db, topup(walletId, "k1"));
    expect(row.id).toBeTruthy();
    expect(row.walletId).toBe(walletId);
    expect(row.amount).toBe(100_000);
    expect(row.kind).toBe("topup");
    expect(row.direction).toBe("credit");
    expect(row.idempotencyKey).toBe("k1");
    expect(await balance(dbh.db, walletId)).toBe(100_000);
  });

  it("derives direction from amount sign", async () => {
    const walletId = await seedWallet();
    const credit = await post(dbh.db, topup(walletId, "c1", 50_000));
    expect(credit.direction).toBe("credit");
    const debit = await post(dbh.db, {
      walletId,
      amount: -20_000,
      kind: "debit" as const,
      idempotencyKey: "d1",
      source: "pos",
      postedBy: "cashier",
    });
    expect(debit.direction).toBe("debit");
  });

  it("same key twice → identical row, exactly one insert (AC2)", async () => {
    const walletId = await seedWallet();
    const first = await post(dbh.db, topup(walletId, "dup"));
    const second = await post(dbh.db, topup(walletId, "dup"));
    expect(second.id).toBe(first.id);
    expect(second).toEqual(first);

    const rows = await dbh.db.select().from(walletLedger);
    expect(rows).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(100_000);
  });

  it("same key, different payload → IdempotencyConflict (AC3)", async () => {
    const walletId = await seedWallet();
    await post(dbh.db, topup(walletId, "conf", 100_000));
    await expect(
      post(dbh.db, topup(walletId, "conf", 999_999)),
    ).rejects.toBeInstanceOf(IdempotencyConflict);

    // The conflicting attempt did not write a second row.
    const rows = await dbh.db.select().from(walletLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(100_000);
  });

  it("IdempotencyConflict carries the key and the existing row", async () => {
    const walletId = await seedWallet();
    const existing = await post(dbh.db, topup(walletId, "ck", 100_000));
    try {
      await post(dbh.db, topup(walletId, "ck", 1));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IdempotencyConflict);
      const conflict = err as IdempotencyConflict;
      expect(conflict.idempotencyKey).toBe("ck");
      expect(conflict.existing.id).toBe(existing.id);
    }
  });

  it("100 concurrent posts of the same key → exactly 1 row (AC2, critical race gate)", async () => {
    const walletId = await seedWallet();
    const attempts = Array.from({ length: 100 }, () =>
      post(dbh.db, topup(walletId, "race", 100_000)),
    );
    const results = await Promise.all(attempts);

    // All 100 callers observe the same single row.
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);

    const rows = await dbh.db.select().from(walletLedger);
    expect(rows).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(100_000);
  });

  it("distinct keys each post a row", async () => {
    const walletId = await seedWallet();
    await post(dbh.db, topup(walletId, "a", 10_000));
    await post(dbh.db, topup(walletId, "b", 20_000));
    const rows = await dbh.db.select().from(walletLedger);
    expect(rows).toHaveLength(2);
    expect(await balance(dbh.db, walletId)).toBe(30_000);
  });
});
