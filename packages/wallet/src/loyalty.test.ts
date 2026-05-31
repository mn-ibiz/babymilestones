import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, walletLedger, loyaltyLedger, auditOutbox } from "@bm/db";
import {
  earnPointsV2 as earnPoints,
  getLoyaltyBalance,
  getLoyaltyTotals,
  getLoyaltyHistory,
} from "./index.js";

let dbh: TestDb;
let walletId: string;
let userId: string;

beforeEach(async () => {
  dbh = await createTestDb();
  const [u] = await dbh.db
    .insert(users)
    .values({ phone: "+254700000001", pinHash: "x" })
    .returning();
  userId = u!.id;
  const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
  walletId = w!.id;
});

afterEach(async () => {
  await dbh.close();
});

/** Post a real wallet_ledger entry so the loyalty row can reference it (AC2). */
async function seedWalletEntry(key: string) {
  const [e] = await dbh.db
    .insert(walletLedger)
    .values({
      walletId,
      amount: 100000,
      direction: "credit",
      kind: "topup",
      idempotencyKey: key,
      postedBy: userId,
      source: "cash",
    })
    .returning();
  return e!.id;
}

describe("earnPoints (P2-E05-S01)", () => {
  it("writes an append-only earn row referencing the triggering wallet entry (AC1, AC2)", async () => {
    const entryId = await seedWalletEntry("topup-1");
    const row = await earnPoints(dbh.db, {
      walletId,
      points: 10,
      rateSnapshot: 100,
      walletLedgerEntryId: entryId,
      sourceType: "topup",
      sourceId: "topup-1",
      idempotencyKey: "earn:topup-1",
    });
    expect(row.direction).toBe("earn");
    expect(row.points).toBe(10);
    expect(row.walletLedgerEntryId).toBe(entryId);

    const all = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.walletId, walletId));
    expect(all).toHaveLength(1);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(10);
  });

  it("snapshots the earn rate so it survives later rate changes (AC3)", async () => {
    const row = await earnPoints(dbh.db, {
      walletId,
      points: 5,
      rateSnapshot: 100,
      sourceType: "topup",
      idempotencyKey: "earn:rate-1",
    });
    expect(row.rateSnapshot).toBe(100);
  });

  it("is idempotent on idempotency_key (no double-credit)", async () => {
    const input = {
      walletId,
      points: 10,
      rateSnapshot: 100,
      sourceType: "topup",
      sourceId: "t1",
      idempotencyKey: "earn:t1",
    };
    const first = await earnPoints(dbh.db, input);
    const second = await earnPoints(dbh.db, input);
    expect(second.id).toBe(first.id);
    const all = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.walletId, walletId));
    expect(all).toHaveLength(1);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(10);
  });

  it("rejects zero / negative / fractional points before any write", async () => {
    for (const bad of [0, -3, 1.5]) {
      await expect(
        earnPoints(dbh.db, {
          walletId,
          points: bad,
          rateSnapshot: 100,
          sourceType: "topup",
          idempotencyKey: `earn:bad-${bad}`,
        }),
      ).rejects.toThrow();
    }
    const all = await dbh.db.select().from(loyaltyLedger);
    expect(all).toHaveLength(0);
  });

  it("audits loyalty.earn", async () => {
    await earnPoints(dbh.db, {
      walletId,
      points: 7,
      rateSnapshot: 100,
      sourceType: "topup",
      idempotencyKey: "earn:audit-1",
      actor: userId,
    });
    const logs = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "loyalty.earn"));
    expect(logs).toHaveLength(1);
  });
});

describe("getLoyaltyBalance / getLoyaltyTotals", () => {
  it("derives net balance from the ledger (earn - redeem)", async () => {
    await earnPoints(dbh.db, {
      walletId,
      points: 100,
      rateSnapshot: 100,
      sourceType: "topup",
      idempotencyKey: "e1",
    });
    await earnPoints(dbh.db, {
      walletId,
      points: 30,
      rateSnapshot: 100,
      sourceType: "booking",
      idempotencyKey: "e2",
    });
    // a redeem row inserted directly to verify the balance subtracts it
    await dbh.db.insert(loyaltyLedger).values({
      walletId,
      direction: "redeem",
      points: 40,
      rateSnapshot: 1,
      sourceType: "redemption",
      idempotencyKey: "r1",
    });
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(90);
    const totals = await getLoyaltyTotals(dbh.db, walletId);
    expect(totals).toEqual({ balance: 90, lifetimeEarned: 130, lifetimeRedeemed: 40 });
  });

  it("returns 0 for an empty wallet", async () => {
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(0);
    expect(await getLoyaltyTotals(dbh.db, walletId)).toEqual({
      balance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
    });
  });
});

describe("getLoyaltyHistory", () => {
  it("returns rows newest-first with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await earnPoints(dbh.db, {
        walletId,
        points: i + 1,
        rateSnapshot: 100,
        sourceType: "topup",
        sourceId: `s${i}`,
        idempotencyKey: `e${i}`,
      });
    }
    const page1 = await getLoyaltyHistory(dbh.db, walletId, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);
    expect(page1[0]!.points).toBe(5); // last inserted, newest first
    expect(page1[1]!.points).toBe(4);

    const page2 = await getLoyaltyHistory(dbh.db, walletId, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
    expect(page2[0]!.points).toBe(3);
  });
});
