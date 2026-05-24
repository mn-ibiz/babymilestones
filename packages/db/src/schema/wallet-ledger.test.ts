import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { users } from "./users.js";
import { wallets } from "./wallets.js";
import { walletLedger } from "./wallet-ledger.js";

describe("wallet_ledger table (P1-E03-S01)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedWallet(phone = "+254712345678"): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  it("inserts a credit entry with integer cents (AC1, AC4)", async () => {
    const walletId = await seedWallet();
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: 150_000, // KES 1,500.00 in cents
        direction: "credit",
        kind: "topup",
        idempotencyKey: "topup-1",
        postedBy: "system",
        source: "mpesa",
      })
      .returning();
    expect(row!.amount).toBe(150_000);
    expect(Number.isInteger(row!.amount)).toBe(true);
    expect(row!.direction).toBe("credit");
    expect(row!.kind).toBe("topup");
    expect(row!.reversesEntryId).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it("stores a signed (negative) debit amount", async () => {
    const walletId = await seedWallet();
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: -50_000,
        direction: "debit",
        kind: "debit",
        idempotencyKey: "debit-1",
        postedBy: "reception",
        source: "checkin",
      })
      .returning();
    expect(row!.amount).toBe(-50_000);
  });

  it("links a reversal to the entry it reverses via reverses_entry_id (AC1)", async () => {
    const walletId = await seedWallet();
    const [orig] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: 20_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "orig-1",
        postedBy: "system",
        source: "cash",
      })
      .returning();
    const [rev] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: -20_000,
        direction: "debit",
        kind: "reversal",
        idempotencyKey: "rev-1",
        postedBy: "admin",
        source: "admin",
        reversesEntryId: orig!.id,
      })
      .returning();
    expect(rev!.reversesEntryId).toBe(orig!.id);
  });

  it("rejects a duplicate idempotency_key (UNIQUE) (AC1)", async () => {
    const walletId = await seedWallet();
    const values = {
      walletId,
      amount: 10_000,
      direction: "credit" as const,
      kind: "topup" as const,
      idempotencyKey: "dup-key",
      postedBy: "system",
      source: "mpesa",
    };
    await dbh.db.insert(walletLedger).values(values);
    await expect(
      dbh.db.insert(walletLedger).values({ ...values, walletId }),
    ).rejects.toThrow();
  });

  it("rejects an unknown direction / kind (CHECK constraint)", async () => {
    const walletId = await seedWallet();
    await expect(
      dbh.db.insert(walletLedger).values({
        walletId,
        amount: 1,
        direction: "sideways",
        kind: "topup",
        idempotencyKey: "bad-dir",
        postedBy: "system",
        source: "mpesa",
      }),
    ).rejects.toThrow();
    await expect(
      dbh.db.insert(walletLedger).values({
        walletId,
        amount: 1,
        direction: "credit",
        kind: "mystery",
        idempotencyKey: "bad-kind",
        postedBy: "system",
        source: "mpesa",
      }),
    ).rejects.toThrow();
  });

  it("rejects an entry for a non-existent wallet (FK)", async () => {
    await expect(
      dbh.db.insert(walletLedger).values({
        walletId: "00000000-0000-0000-0000-000000000000",
        amount: 1,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "no-wallet",
        postedBy: "system",
        source: "mpesa",
      }),
    ).rejects.toThrow();
  });

  // --- Append-only enforcement (AC2/AC3): the DB rejects UPDATE and DELETE. ---

  it("rejects UPDATE wallet_ledger (append-only trigger) (AC3)", async () => {
    const walletId = await seedWallet();
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: 99_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "immut-update",
        postedBy: "system",
        source: "mpesa",
      })
      .returning();

    await expect(
      dbh.db.update(walletLedger).set({ amount: 0 }).where(eq(walletLedger.id, row!.id)),
    ).rejects.toThrow(/append-only/i);

    // The row is unchanged.
    const [after] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, row!.id));
    expect(after!.amount).toBe(99_000);
  });

  it("rejects DELETE FROM wallet_ledger (append-only trigger) (AC3)", async () => {
    const walletId = await seedWallet();
    const [row] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId,
        amount: 99_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "immut-delete",
        postedBy: "system",
        source: "mpesa",
      })
      .returning();

    await expect(
      dbh.db.delete(walletLedger).where(eq(walletLedger.id, row!.id)),
    ).rejects.toThrow(/append-only/i);

    const all = await dbh.db.select().from(walletLedger);
    expect(all).toHaveLength(1);
  });

  it("stores amount as an integer column, never a float (AC4)", async () => {
    // Confirm the column data type is bigint (no float/numeric-with-scale).
    const res = await dbh.pg.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'wallet_ledger' AND column_name = 'amount'`,
    );
    expect(res.rows[0]?.data_type).toBe("bigint");
  });
});
