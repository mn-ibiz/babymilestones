import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, walletLedger, loyaltyLedger, auditOutbox } from "@bm/db";
import {
  earnPointsV2,
  getLoyaltyBalance,
  earnPoints,
  loyaltyBalance,
  balance as walletBalance,
  redeemPoints,
  InsufficientPointsError,
  availableLoyaltyToRedeem,
  markPendingClawback,
} from "./index.js";
import { clawbackForRefund } from "./loyalty-clawback.js";
import { post as ledgerPost } from "./index.js";

// ── P2-E05-S03 redeemPoints suite ─────────────────────────────────────────────

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

async function earnV2(points: number, key: string) {
  await earnPointsV2(dbh.db, {
    walletId,
    points,
    rateSnapshot: 100,
    sourceType: "topup",
    idempotencyKey: key,
  });
}

describe("redeemPoints (P2-E05-S03)", () => {
  it("credits the wallet by points * redeem_rate and writes a loyalty debit (AC2, AC4)", async () => {
    await earnV2(100, "e1");
    const res = await redeemPoints(dbh.db, {
      walletId,
      points: 40,
      idempotencyKey: "redeem-1",
      actor: userId,
    });
    expect(res.discountCents).toBe(4000);
    expect(res.redeemedPoints).toBe(40);
    expect(res.balance).toBe(60);
    expect(await walletBalance(dbh.db, walletId)).toBe(4000);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);
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
    await earnV2(30, "e1");
    await expect(
      redeemPoints(dbh.db, { walletId, points: 31, idempotencyKey: "redeem-over", actor: userId }),
    ).rejects.toBeInstanceOf(InsufficientPointsError);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(30);
    expect(await walletBalance(dbh.db, walletId)).toBe(0);
  });

  it("can redeem the exact full balance down to zero", async () => {
    await earnV2(50, "e1");
    const res = await redeemPoints(dbh.db, { walletId, points: 50, idempotencyKey: "redeem-all", actor: userId });
    expect(res.balance).toBe(0);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(0);
  });

  it("is idempotent: a retried redeem does not double-spend (AC3)", async () => {
    await earnV2(100, "e1");
    const a = await redeemPoints(dbh.db, { walletId, points: 40, idempotencyKey: "redeem-dup", actor: userId });
    const b = await redeemPoints(dbh.db, { walletId, points: 40, idempotencyKey: "redeem-dup", actor: userId });
    expect(b.loyaltyEntryId).toBe(a.loyaltyEntryId);
    const redeems = await dbh.db.select().from(loyaltyLedger).where(eq(loyaltyLedger.direction, "redeem"));
    expect(redeems).toHaveLength(1);
    expect(await getLoyaltyBalance(dbh.db, walletId)).toBe(60);
    expect(await walletBalance(dbh.db, walletId)).toBe(4000);
  });

  it("snapshots the redeem rate used", async () => {
    await earnV2(20, "e1");
    const res = await redeemPoints(dbh.db, { walletId, points: 10, idempotencyKey: "redeem-rate", actor: userId, redeemRate: 2 });
    expect(res.discountCents).toBe(2000);
    const [row] = await dbh.db.select().from(loyaltyLedger).where(eq(loyaltyLedger.idempotencyKey, "redeem-rate"));
    expect(row!.rateSnapshot).toBe(2);
  });

  it("rejects zero / negative points", async () => {
    await earnV2(50, "e1");
    for (const bad of [0, -5]) {
      await expect(
        redeemPoints(dbh.db, { walletId, points: bad, idempotencyKey: `redeem-bad-${bad}`, actor: userId }),
      ).rejects.toThrow();
    }
  });

  it("audits loyalty.redeem", async () => {
    await earnV2(50, "e1");
    await redeemPoints(dbh.db, { walletId, points: 10, idempotencyKey: "redeem-audit", actor: userId });
    const logs = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "loyalty.redeem"));
    expect(logs).toHaveLength(1);
  });
});

// ── P3-E04-S04 pending settlement suite ──────────────────────────────────────

describe("loyalty redemption respects pending settlement (P3-E04-S04)", () => {
  let dbh2: Awaited<ReturnType<typeof createTestDb>>;
  let parentId: string;
  let walletId2: string;
  let seq = 0;

  beforeEach(async () => {
    dbh2 = await createTestDb();
    seq += 1;
    const [u] = await dbh2.db
      .insert(users)
      .values({ phone: `+25471${String(3000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    parentId = u!.id;
    const [w] = await dbh2.db.insert(wallets).values({ userId: parentId }).returning();
    walletId2 = w!.id;
  });
  afterEach(async () => {
    await dbh2.close();
  });

  async function seedRefund(tag: string): Promise<string> {
    await ledgerPost(dbh2.db, { walletId: walletId2, amount: 500_000, kind: "topup", idempotencyKey: `t:${walletId2}:${tag}`, source: "cash", postedBy: "system" });
    const refund = await ledgerPost(dbh2.db, { walletId: walletId2, amount: 30_000, kind: "refund", idempotencyKey: `r:${walletId2}:${tag}`, source: "admin", postedBy: "admin" });
    return refund.id;
  }

  it("with no pending clawback, available equals the balance (AC1)", async () => {
    await earnPoints({ db: dbh2.db, parentId, points: 100 });
    const r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.balance).toBe(100);
    expect(r.pendingClawback).toBe(0);
    expect(r.availableToRedeem).toBe(100);
  });

  it("a pending clawback reduces available but NOT the raw balance (AC1/AC2)", async () => {
    const earn = await earnPoints({ db: dbh2.db, parentId, points: 100 });
    const refundId = await seedRefund("a");
    await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 30, refundWalletLedgerId: refundId });
    expect(await loyaltyBalance(dbh2.db, parentId)).toBe(100);
    const r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.balance).toBe(100);
    expect(r.pendingClawback).toBe(30);
    expect(r.availableToRedeem).toBe(70);
  });

  it("available never goes below zero when pending exceeds the balance (AC1)", async () => {
    const earn = await earnPoints({ db: dbh2.db, parentId, points: 20 });
    const refundId = await seedRefund("b");
    await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 50, refundWalletLedgerId: refundId });
    const r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.availableToRedeem).toBe(0);
  });

  it("markPendingClawback writes a zero-delta provisional row (append-only, AC2)", async () => {
    const earn = await earnPoints({ db: dbh2.db, parentId, points: 100 });
    const refundId = await seedRefund("c");
    const res = await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 40, refundWalletLedgerId: refundId });
    const [row] = await dbh2.db.select().from(loyaltyLedger).where(eq(loyaltyLedger.id, res.ledgerId));
    expect(row!.pointsDelta).toBe(0);
    expect(row!.pendingClawback).toBe(40);
    expect(row!.reversesLoyaltyLedgerId).toBe(earn.id);
  });

  it("is idempotent on the same refund (AC2)", async () => {
    const earn = await earnPoints({ db: dbh2.db, parentId, points: 100 });
    const refundId = await seedRefund("d");
    const a = await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 30, refundWalletLedgerId: refundId });
    const b = await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 30, refundWalletLedgerId: refundId });
    expect(b.alreadyPending).toBe(true);
    expect(b.ledgerId).toBe(a.ledgerId);
    const r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.pendingClawback).toBe(30);
  });

  it("finalising the clawback clears the pending and reduces the balance (AC1)", async () => {
    const earn = await earnPoints({ db: dbh2.db, parentId, points: 100 });
    const refundId = await seedRefund("e");
    await markPendingClawback({ db: dbh2.db, parentId, earnLedgerId: earn.id, points: 30, refundWalletLedgerId: refundId });
    let r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.availableToRedeem).toBe(70);
    await clawbackForRefund({ db: dbh2.db, parentId, earnLedgerId: earn.id, earnedPoints: 100, refundedMinor: 300, originalMinor: 1000, refundWalletLedgerId: refundId });
    expect(await loyaltyBalance(dbh2.db, parentId)).toBe(70);
    r = await availableLoyaltyToRedeem(dbh2.db, parentId);
    expect(r.pendingClawback).toBe(0);
    expect(r.balance).toBe(70);
    expect(r.availableToRedeem).toBe(70);
  });
});
