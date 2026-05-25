import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { floatAccounts, users, wallets } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { post, resolveFloatAccountId } from "./index.js";

/**
 * P1-E06-S01 AC3 — float-account tagging primitives. `resolveFloatAccountId`
 * maps a payment method to the active float account; `post` persists the tag.
 */
describe("wallet float-account tagging (P1-E06-S01)", () => {
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

  it("resolves the active account of the method's kind, oldest first", async () => {
    const [till] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Till", kind: "mpesa_till", openingDate: "2026-05-25" })
      .returning();
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Bank", kind: "bank", openingDate: "2026-05-25" });

    expect(await resolveFloatAccountId(dbh.db, "mpesa_stk")).toBe(till!.id);
    expect(await resolveFloatAccountId(dbh.db, "cash")).toBeNull(); // no cash_drawer yet
    expect(await resolveFloatAccountId(dbh.db, "unknown")).toBeNull();
  });

  it("ignores inactive accounts", async () => {
    await dbh.db
      .insert(floatAccounts)
      .values({ name: "Old Till", kind: "mpesa_till", openingDate: "2026-05-25", active: false });
    expect(await resolveFloatAccountId(dbh.db, "mpesa_stk")).toBeNull();
  });

  it("post() persists the resolved float_account_id (AC3)", async () => {
    const walletId = await seedWallet();
    const [cash] = await dbh.db
      .insert(floatAccounts)
      .values({ name: "Cash Drawer", kind: "cash_drawer", openingDate: "2026-05-25" })
      .returning();
    const faId = await resolveFloatAccountId(dbh.db, "cash");
    expect(faId).toBe(cash!.id);

    const row = await post(dbh.db, {
      walletId,
      amount: 50_000,
      kind: "topup",
      idempotencyKey: "topup-float-1",
      source: "cash",
      postedBy: "system",
      floatAccountId: faId,
    });
    expect(row.floatAccountId).toBe(cash!.id);
  });

  it("post() leaves float_account_id null when not provided (back-compat)", async () => {
    const walletId = await seedWallet();
    const row = await post(dbh.db, {
      walletId,
      amount: 1_000,
      kind: "topup",
      idempotencyKey: "topup-float-2",
      source: "mpesa",
      postedBy: "system",
    });
    expect(row.floatAccountId).toBeNull();
  });
});
