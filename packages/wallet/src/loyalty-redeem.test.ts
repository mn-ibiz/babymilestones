import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, walletLedger, loyaltyLedger, auditOutbox } from "@bm/db";
import {
  earnPoints,
  getLoyaltyBalance,
  balance as walletBalance,
  redeemPoints,
  InsufficientPointsError,
} from "./index.js";

let dbh: TestDb;
let walletId: string;
let userId: string;

beforeEach(async () => {
  dbh = await createTestDb();
  const [u] = await dbh.db
    .insert(users)
    .values({ phone: "+254700000002", pinHash: "x" })
    .returning();
  userId = u!.id;
  const [w] = await dbh.db.insert(wallets).values({ userId }).returning();
  walletId = w!.id;
});

afterEach(async () => {
  await dbh.close();
});

async function earn(points: number, key: string) {
  await earnPoints(dbh.db, {
    walletId,
    points,
    rateSnapshot: 100,
    sourceType: "topup",
    idempotencyKey: key,
  });
}

describe("redeemPoints (P2-E05-S03)", () => {
  it("credits the wallet by points * redeem_rate and writes a loyalty debit (AC2, AC4)", async () => {
    await earn(100, "e1"); // balance 100 points
    const res = await redeemPoints(dbh.db, {
      walletId,
      points: 40,
      idempotencyKey: "redeem-1",
      actor: userId,
    });
    // default redeem rate = 1 KES/point -> 40 KES -> 4000 cents
    expect(res.discountCents).toBe(4000);
    expect(res.redeemedPoints).toBe(40);
    expect(res.balance).toBe(60);

    // wallet was credited with the discount (AC2/AC4)
    expect(await walletBalance(dbh.db, walletId)).toBe(4000);
    // loyalty balance dropped
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);

    // a loyalty_ledger debit row referencing the wallet credit (AC4)
    const [redeemRow] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.direction, "redeem"));
    expect(redeemRow!.points).toBe(40);
    expect(redeemRow!.walletLedgerEntryId).toBe(res.walletEntryId);

    const [walletRow] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, res.walletEntryId));
    expect(walletRow!.amount).toBe(4000);
    expect(walletRow!.direction).toBe("credit");
  });

  it("cannot redeem more points than the balance (AC3)", async () => {
    await earn(30, "e1");
    await expect(
      redeemPoints(dbh.db, {
        walletId,
        points: 31,
        idempotencyKey: "redeem-over",
        actor: userId,
      }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);
    // nothing was written
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(30);
    expect(await walletBalance(dbh.db, walletId)).toBe(0);
  });

  it("can redeem the exact full balance down to zero", async () => {
    await earn(50, "e1");
    const res = await redeemPoints(dbh.db, {
      walletId,
      points: 50,
      idempotencyKey: "redeem-all",
      actor: userId,
    });
    expect(res.balance).toBe(0);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(0);
  });

  it("is idempotent: a retried redeem does not double-spend (AC3)", async () => {
    await earn(100, "e1");
    const a = await redeemPoints(dbh.db, {
      walletId,
      points: 40,
      idempotencyKey: "redeem-dup",
      actor: userId,
    });
    const b = await redeemPoints(dbh.db, {
      walletId,
      points: 40,
      idempotencyKey: "redeem-dup",
      actor: userId,
    });
    expect(b.loyaltyEntryId).toBe(a.loyaltyEntryId);
    // only ONE redeem row + ONE wallet credit
    const redeems = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.direction, "redeem"));
    expect(redeems).toHaveLength(1);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);
    expect(await walletBalance(dbh.db, walletId)).toBe(4000);
  });

  it("snapshots the redeem rate used", async () => {
    await earn(20, "e1");
    const res = await redeemPoints(dbh.db, {
      walletId,
      points: 10,
      idempotencyKey: "redeem-rate",
      actor: userId,
      redeemRate: 2, // 2 KES/point -> 10 pts = 20 KES = 2000c
    });
    expect(res.discountCents).toBe(2000);
    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.idempotencyKey, "redeem-rate"));
    expect(row!.rateSnapshot).toBe(2);
  });

  it("rejects zero / negative points", async () => {
    await earn(50, "e1");
    for (const bad of [0, -5]) {
      await expect(
        redeemPoints(dbh.db, {
          walletId,
          points: bad,
          idempotencyKey: `redeem-bad-${bad}`,
          actor: userId,
        }),
      ).rejects.toThrow();
    }
  });

  it("audits loyalty.redeem", async () => {
    await earn(50, "e1");
    await redeemPoints(dbh.db, {
      walletId,
      points: 10,
      idempotencyKey: "redeem-audit",
      actor: userId,
    });
    const logs = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "loyalty.redeem"));
    expect(logs).toHaveLength(1);
  });
});
