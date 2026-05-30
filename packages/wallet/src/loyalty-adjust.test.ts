import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, loyaltyLedger } from "@bm/db";
import { loyaltyBalance } from "./loyalty.js";
import { adjustLoyaltyPoints, LoyaltyAdjustmentError } from "./loyalty-adjust.js";

/**
 * P3-E04-S03 — Admin manual loyalty adjustment. An admin credits (positive) or
 * debits (negative) a parent's points balance for goodwill or correction. Writes
 * a NEW append-only `loyalty_ledger` row (`kind='adjustment'`) stamped with the
 * acting admin; integer points only. A debit may legitimately drive the balance
 * negative (negative carry, S02), so it is flagged. Audit/permission are enforced
 * at the API layer; this is the pure ledger service.
 */
describe("adjustLoyaltyPoints (P3-E04-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let parentId: string;
  let seq = 0;

  beforeEach(async () => {
    dbh = await createTestDb();
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25475${String(5000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    parentId = u!.id;
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("credits points as a positive adjustment row stamped with the admin (AC2)", async () => {
    const res = await adjustLoyaltyPoints({
      db: dbh.db,
      parentId,
      points: 250,
      reason: "goodwill — late session",
      adminUserId: "admin-1",
    });

    expect(res.pointsDelta).toBe(250);
    expect(res.balanceAfter).toBe(250);
    expect(res.negativeCarry).toBe(false);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(250);

    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.ledgerId));
    expect(row!.kind).toBe("adjustment");
    expect(row!.pointsDelta).toBe(250);
    expect(row!.postedBy).toBe("admin-1");
  });

  it("debits points as a negative adjustment row (correction)", async () => {
    await adjustLoyaltyPoints({
      db: dbh.db,
      parentId,
      points: 100,
      reason: "seed",
      adminUserId: "admin-1",
    });
    const res = await adjustLoyaltyPoints({
      db: dbh.db,
      parentId,
      points: -40,
      reason: "correction — duplicate earn",
      adminUserId: "admin-2",
    });
    expect(res.pointsDelta).toBe(-40);
    expect(res.balanceAfter).toBe(60);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(60);
  });

  it("a debit beyond the balance is allowed and flags negative carry (S02)", async () => {
    const res = await adjustLoyaltyPoints({
      db: dbh.db,
      parentId,
      points: -30,
      reason: "clerical correction",
      adminUserId: "admin-1",
    });
    expect(res.pointsDelta).toBe(-30);
    expect(res.balanceAfter).toBe(-30);
    expect(res.negativeCarry).toBe(true);
    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.ledgerId));
    expect(row!.negativeCarry).toBe(true);
  });

  it("rejects a zero adjustment", async () => {
    await expect(
      adjustLoyaltyPoints({
        db: dbh.db,
        parentId,
        points: 0,
        reason: "noop",
        adminUserId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(LoyaltyAdjustmentError);
  });

  it("rejects a fractional adjustment (integer points only)", async () => {
    await expect(
      adjustLoyaltyPoints({
        db: dbh.db,
        parentId,
        points: 12.5,
        reason: "frac",
        adminUserId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(LoyaltyAdjustmentError);
  });

  it("requires a non-empty reason", async () => {
    await expect(
      adjustLoyaltyPoints({
        db: dbh.db,
        parentId,
        points: 10,
        reason: "   ",
        adminUserId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(LoyaltyAdjustmentError);
  });
});
