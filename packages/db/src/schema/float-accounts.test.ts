import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { users } from "./users.js";
import { wallets } from "./wallets.js";
import { walletLedger } from "./wallet-ledger.js";
import { floatAccounts } from "./float-accounts.js";

describe("float_accounts table (P1-E06-S01)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("inserts an account with defaults (active=true, opening_balance=0) (AC1)", async () => {
    const [row] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "M-Pesa Till 1", kind: "mpesa_till", openingDate: "2026-05-25" })
      .returning();
    expect(row!.name).toBe("M-Pesa Till 1");
    expect(row!.kind).toBe("mpesa_till");
    expect(row!.openingBalance).toBe(0);
    expect(row!.active).toBe(true);
    expect(row!.openingDate).toBe("2026-05-25");
  });

  it("rejects an unknown kind (CHECK) (AC1)", async () => {
    await expect(
      dbh.db
        .insert(floatAccounts)
        // Exercising the DB CHECK with an invalid kind (kind is free `text` in
        // the schema; the migration's CHECK constraint rejects it).
        .values({ name: "Bad", kind: "crypto", openingDate: "2026-05-25" }),
    ).rejects.toThrow();
  });

  it("rejects a negative opening balance (CHECK) (AC1)", async () => {
    await expect(
      dbh.db
        .insert(floatAccounts)
        .values({ name: "x", kind: "bank", openingBalance: -1, openingDate: "2026-05-25" }),
    ).rejects.toThrow();
  });

  it("tags a wallet_ledger entry with float_account_id (AC3)", async () => {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [fa] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Cash", kind: "cash_drawer", openingDate: "2026-05-25" })
      .returning();
    const [entry] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId: w!.id,
        amount: 50_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "k1",
        postedBy: "system",
        source: "cash",
        floatAccountId: fa!.id,
      })
      .returning();
    expect(entry!.floatAccountId).toBe(fa!.id);

    const [reread] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, entry!.id));
    expect(reread!.floatAccountId).toBe(fa!.id);
  });

  it("allows a null float_account_id on a ledger entry (additive/back-compat)", async () => {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000000", pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [entry] = await dbh.db
      .insert(walletLedger)
      .values({
        walletId: w!.id,
        amount: 1_000,
        direction: "credit",
        kind: "topup",
        idempotencyKey: "k2",
        postedBy: "system",
        source: "mpesa",
      })
      .returning();
    expect(entry!.floatAccountId).toBeNull();
  });
});
