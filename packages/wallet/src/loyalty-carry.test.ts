import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, loyaltyLedger } from "@bm/db";
import { earnPoints, loyaltyBalance } from "./loyalty.js";

/**
 * P3-E04-S02 — Negative-loyalty carry repaid by future earnings. When a parent's
 * loyalty balance is negative (a prior clawback overshot the balance), the next
 * earn first repays the carry up to 0, then the remainder is spendable. The earn
 * row credits the FULL points (so the running balance recovers) and tags the
 * `applied_to_negative_carry` portion for traceability (AC2). Integer points,
 * no float drift.
 */
describe("earnPoints repays negative carry first (P3-E04-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let parentId: string;
  let seq = 0;

  beforeEach(async () => {
    dbh = await createTestDb();
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+25473${String(4000000 + seq).slice(-7)}`, pinHash: "x" })
      .returning();
    parentId = u!.id;
  });
  afterEach(async () => {
    await dbh.close();
  });

  /** Seed a negative carry by posting a raw clawback debit directly. */
  async function seedCarry(deficit: number) {
    await dbh.db.insert(loyaltyLedger).values({
      parentId,
      pointsDelta: -deficit,
      kind: "clawback",
      postedBy: "admin",
      negativeCarry: true,
    });
  }

  it("AC1/AC2: earn smaller than the carry repays it all, 0 spendable, full delta credited", async () => {
    await seedCarry(80); // balance -80
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(-80);

    const res = await earnPoints({ db: dbh.db, parentId, points: 50 });

    expect(res.appliedToNegativeCarry).toBe(50);
    expect(res.spendable).toBe(0);
    expect(res.points).toBe(50);
    expect(res.balanceAfter).toBe(-30); // -80 + 50
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(-30);

    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.id, res.id));
    expect(row!.kind).toBe("earn");
    expect(row!.pointsDelta).toBe(50); // full earn credited (append-only recovery)
    expect(row!.appliedToNegativeCarry).toBe(50); // AC2: portion tagged
  });

  it("AC1: earn larger than the carry repays it then leaves spendable remainder", async () => {
    await seedCarry(30); // balance -30
    const res = await earnPoints({ db: dbh.db, parentId, points: 100 });

    expect(res.appliedToNegativeCarry).toBe(30);
    expect(res.spendable).toBe(70);
    expect(res.balanceAfter).toBe(70); // -30 + 100
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(70);
  });

  it("AC1: earn exactly equal to the carry clears it to 0, 0 spendable", async () => {
    await seedCarry(40);
    const res = await earnPoints({ db: dbh.db, parentId, points: 40 });
    expect(res.appliedToNegativeCarry).toBe(40);
    expect(res.spendable).toBe(0);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(0);
  });

  it("no carry: the whole earn is spendable, nothing applied to carry", async () => {
    const res = await earnPoints({ db: dbh.db, parentId, points: 60 });
    expect(res.appliedToNegativeCarry).toBe(0);
    expect(res.spendable).toBe(60);
    expect(res.balanceAfter).toBe(60);
  });

  it("successive earns: the second sees the recovered balance and is fully spendable", async () => {
    await seedCarry(100); // -100
    const first = await earnPoints({ db: dbh.db, parentId, points: 100 }); // clears to 0
    expect(first.appliedToNegativeCarry).toBe(100);
    expect(first.spendable).toBe(0);

    const second = await earnPoints({ db: dbh.db, parentId, points: 40 });
    expect(second.appliedToNegativeCarry).toBe(0);
    expect(second.spendable).toBe(40);
    expect(await loyaltyBalance(dbh.db, parentId)).toBe(40);
  });
});
