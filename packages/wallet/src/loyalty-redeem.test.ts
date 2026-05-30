import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, wallets } from "@bm/db";
import { loyaltyLedger } from "@bm/db";
import { earnPoints, loyaltyBalance } from "./loyalty.js";
import { clawbackForRefund } from "./loyalty-clawback.js";
import { post as ledgerPost } from "./index.js";
import {
  availableLoyaltyToRedeem,
  markPendingClawback,
} from "./loyalty-redeem.js";

/**
 * P3-E04-S04 — loyalty redemption respects pending settlement. The system must
 * never let a parent redeem points that are about to be clawed back: while a
 * refund is initiated-but-not-finalised, the proportional points are held as
 * `pending_clawback`, and `available_to_redeem = balance − Σ pending` (AC1).
 *
 * Append-only model: `markPendingClawback` appends a provisional zero-delta
 * marker row carrying the pending amount (AC2) — the balance is unchanged (the
 * clawback is not finalised) but the redeemable amount drops. When the refund
 * finalises, `clawbackForRefund` posts the real negative entry AND offsets the
 * pending it provisioned, so `available_to_redeem` re-aligns with the reduced
 * balance (no double counting).
 */
describe("loyalty redemption respects pending settlement (P3-E04-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let parentId: string;
  let walletId: string;
  let seq = 0;

  beforeEach(async () => {
    dbh = await createTestDb();
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25471${String(3000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    parentId = u!.id;
    const [w] = await dbh.db.insert(wallets).values({ userId: parentId }).returning();
    walletId = w!.id;
  });
  afterEach(async () => {
    await dbh.close();
  });

  /**
   * Seed a real `wallet_ledger` refund row and return its id. `loyalty_ledger`
   * FKs `source_wallet_ledger_id` to `wallet_ledger(id)`, so the refund id used
   * to provision/finalise a clawback must reference an actual ledger entry.
   */
  async function seedRefund(tag: string): Promise<string> {
    await ledgerPost(dbh.db, {
      walletId,
      amount: 500_000,
      kind: "topup",
      idempotencyKey: `t:${walletId}:${tag}`,
      source: "cash",
      postedBy: "system",
    });
    const refund = await ledgerPost(dbh.db, {
      walletId,
      amount: 30_000,
      kind: "refund",
      idempotencyKey: `r:${walletId}:${tag}`,
      source: "admin",
      postedBy: "admin",
    });
    return refund.id;
  }

  it("with no pending clawback, available equals the balance (AC1)", async () => {
    await earnPoints({ db: dbh.db, parentId, points: 100 });
    const r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.balance).toBe(100);
    expect(r.pendingClawback).toBe(0);
    expect(r.availableToRedeem).toBe(100);
  });

  it("a pending clawback reduces available but NOT the raw balance (AC1/AC2)", async () => {
    const earn = await earnPoints({ db: dbh.db, parentId, points: 100 });
    const refundId = await seedRefund("a");
    await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 30,
      refundWalletLedgerId: refundId,
    });

    // Balance is unchanged — the clawback is only *pending* (not finalised).
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(100);

    const r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.balance).toBe(100);
    expect(r.pendingClawback).toBe(30);
    expect(r.availableToRedeem).toBe(70);
  });

  it("available never goes below zero when pending exceeds the balance (AC1)", async () => {
    const earn = await earnPoints({ db: dbh.db, parentId, points: 20 });
    const refundId = await seedRefund("b");
    await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 50,
      refundWalletLedgerId: refundId,
    });
    const r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.availableToRedeem).toBe(0);
  });

  it("markPendingClawback writes a zero-delta provisional row (append-only, AC2)", async () => {
    const earn = await earnPoints({ db: dbh.db, parentId, points: 100 });
    const refundId = await seedRefund("c");
    const res = await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 40,
      refundWalletLedgerId: refundId,
    });
    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.ledgerId));
    expect(row!.pointsDelta).toBe(0); // provisional — no balance movement yet
    expect(row!.pendingClawback).toBe(40);
    expect(row!.reversesLoyaltyLedgerId).toBe(earn.id);
  });

  it("is idempotent on the same refund — pending is provisioned once (AC2)", async () => {
    const earn = await earnPoints({ db: dbh.db, parentId, points: 100 });
    const refundId = await seedRefund("d");
    const a = await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 30,
      refundWalletLedgerId: refundId,
    });
    const b = await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 30,
      refundWalletLedgerId: refundId,
    });
    expect(b.alreadyPending).toBe(true);
    expect(b.ledgerId).toBe(a.ledgerId);
    const r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.pendingClawback).toBe(30); // not 60
  });

  it("finalising the clawback clears the pending and reduces the balance (AC1)", async () => {
    const earn = await earnPoints({ db: dbh.db, parentId, points: 100 });
    const refundId = await seedRefund("e");
    await markPendingClawback({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      points: 30,
      refundWalletLedgerId: refundId,
    });
    // Pending state: balance 100, available 70.
    let r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.availableToRedeem).toBe(70);

    // Finalise: a refund of 30% of a 1000-minor spend earned 100 → claw 30.
    await clawbackForRefund({
      db: dbh.db,
      parentId,
      earnLedgerId: earn.id,
      earnedPoints: 100,
      refundedMinor: 300,
      originalMinor: 1000,
      refundWalletLedgerId: refundId,
    });

    // Now the balance itself drops by 30, and the pending is cleared, so
    // available equals the (reduced) balance — never double-counted.
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(70);
    r = await availableLoyaltyToRedeem(dbh.db, parentId);
    expect(r.pendingClawback).toBe(0);
    expect(r.balance).toBe(70);
    expect(r.availableToRedeem).toBe(70);
  });
});
