import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, wallets, loyaltyLedger } from "@bm/db";
import { loyaltyClawbackPoints } from "@bm/contracts";
import { earnPoints, loyaltyBalance } from "./loyalty.js";
import { post as ledgerPost } from "./index.js";
import { clawbackForRefund } from "./loyalty-clawback.js";

/**
 * P3-E04-S01 — Proportional loyalty clawback on refund. A clawback is a NEW
 * negative `loyalty_ledger` row (`kind='clawback'`) referencing the earn it
 * reverses; the original earn is never mutated (append-only). Covers the
 * proportional integer math, the reversing-entry shape, negative carry (AC4),
 * and idempotency on refund replay.
 */
describe("loyaltyClawbackPoints (pure integer math, no float drift)", () => {
  it("claws back the full earn on a full refund", () => {
    expect(loyaltyClawbackPoints(100, 30_000, 30_000)).toBe(100);
  });
  it("claws back nothing on a zero refund", () => {
    expect(loyaltyClawbackPoints(100, 0, 30_000)).toBe(0);
  });
  it("claws back proportionally (half)", () => {
    expect(loyaltyClawbackPoints(100, 15_000, 30_000)).toBe(50);
  });
  it("rounds half-up at the integer boundary", () => {
    expect(loyaltyClawbackPoints(7, 10_000, 30_000)).toBe(2); // 2.33 → 2
    expect(loyaltyClawbackPoints(7, 20_000, 30_000)).toBe(5); // 4.66 → 5
  });
  it("does not drift where naive float multiplication would", () => {
    // 333 × 0.1 in float is 33.300000000000004; integer path yields 33.
    expect(loyaltyClawbackPoints(333, 10_000, 100_000)).toBe(33);
  });
  it("clamps to [0, earned] and guards a zero original", () => {
    expect(loyaltyClawbackPoints(100, 40_000, 30_000)).toBe(100);
    expect(loyaltyClawbackPoints(0, 30_000, 30_000)).toBe(0);
    expect(loyaltyClawbackPoints(100, 30_000, 0)).toBe(0);
  });
});

describe("clawbackForRefund (reversing ledger entry, P3-E04-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let parentId: string;
  let walletId: string;
  let seq = 0;

  beforeEach(async () => {
    dbh = await createTestDb();
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25472${String(3000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    parentId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId: parentId }).returning();
    walletId = w!.id;
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Post a debit then a refund against it; return both ledger entry ids. */
  async function spendAndRefund(spend: number, refundAmt: number) {
    await ledgerPost(dbh.db, {
      walletId,
      amount: 500_000,
      kind: "topup",
      idempotencyKey: `t:${walletId}:${seq}`,
      source: "cash",
      postedBy: "system",
    });
    const debit = await ledgerPost(dbh.db, {
      walletId,
      amount: -spend,
      kind: "debit",
      idempotencyKey: `d:${walletId}:${seq}`,
      source: "checkin",
      postedBy: "reception",
    });
    const refundRow = await ledgerPost(dbh.db, {
      walletId,
      amount: refundAmt,
      kind: "refund",
      idempotencyKey: `r:${walletId}:${seq}`,
      source: "admin",
      postedBy: "admin",
    });
    return { debitId: debit.id, refundId: refundRow.id };
  }

  it("appends a negative reversing entry proportional to the refund fraction (AC1/AC2)", async () => {
    const { debitId, refundId } = await spendAndRefund(30_000, 15_000);
    const earn = await earnPoints({
      db: dbh.db,
      parentId,
      points: 100,
      earnRate: 1,
      earnedAmountMinor: 30_000,
      sourceWalletLedgerId: debitId,
    });
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(100);

    const res = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 15_000,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });

    expect(res.clawedBack).toBe(50);
    expect(res.alreadyClawedBack).toBe(false);
    expect(res.negativeCarry).toBe(false);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(50);

    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.ledgerId!));
    expect(row!.kind).toBe("clawback");
    expect(row!.pointsDelta).toBe(-50);
    expect(row!.reversesLoyaltyLedgerId).toBe(earn.id); // AC2: FK to the earn
    expect(row!.sourceWalletLedgerId).toBe(refundId);
    expect(row!.negativeCarry).toBe(false);
  });

  it("debits straightforwardly when the balance is sufficient (AC3)", async () => {
    const { debitId, refundId } = await spendAndRefund(30_000, 30_000);
    const earn = await earnPoints({
      db: dbh.db,
      parentId,
      points: 100,
      sourceWalletLedgerId: debitId,
    });
    const res = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 30_000,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });
    expect(res.clawedBack).toBe(100);
    expect(res.negativeCarry).toBe(false);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(0);
  });

  it("lets the balance go negative and flags negative_carry (AC4)", async () => {
    const { debitId, refundId } = await spendAndRefund(30_000, 30_000);
    const earn = await earnPoints({
      db: dbh.db,
      parentId,
      points: 100,
      sourceWalletLedgerId: debitId,
    });
    // Parent spent 80 of the 100 points elsewhere → balance 20.
    await dbh.db.insert(loyaltyLedger).values({
      parentId,
      pointsDelta: -80,
      kind: "redeem",
      postedBy: "parent",
    });
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(20);

    const res = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 30_000,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });
    expect(res.clawedBack).toBe(100);
    expect(res.negativeCarry).toBe(true); // AC4
    expect(res.balanceAfter).toBe(-80); // 20 − 100
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(-80);

    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.ledgerId!));
    expect(row!.negativeCarry).toBe(true);
  });

  it("is idempotent on refund replay — does not claw back twice", async () => {
    const { debitId, refundId } = await spendAndRefund(30_000, 30_000);
    const earn = await earnPoints({
      db: dbh.db,
      parentId,
      points: 100,
      sourceWalletLedgerId: debitId,
    });
    const first = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 30_000,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });
    expect(first.clawedBack).toBe(100);
    expect(first.alreadyClawedBack).toBe(false);

    const replay = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 30_000,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });
    expect(replay.alreadyClawedBack).toBe(true);
    expect(replay.clawedBack).toBe(0);

    const rows = (await dbh.db.select().from(loyaltyLedger)).filter(
      (r) => r.kind === "clawback",
    );
    expect(rows).toHaveLength(1);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(0);
  });

  it("writes nothing when the proportional clawback is zero", async () => {
    const { debitId, refundId } = await spendAndRefund(30_000, 1);
    const earn = await earnPoints({
      db: dbh.db,
      parentId,
      points: 100,
      sourceWalletLedgerId: debitId,
    });
    const res = await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 0,
      originalMinor: 30_000,
      refundWalletLedgerId: refundId,
      postedBy: "admin",
    });
    expect(res.clawedBack).toBe(0);
    expect(res.ledgerId).toBeNull();
    const rows = (await dbh.db.select().from(loyaltyLedger)).filter(
      (r) => r.kind === "clawback",
    );
    expect(rows).toHaveLength(0);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(100);
  });
});
