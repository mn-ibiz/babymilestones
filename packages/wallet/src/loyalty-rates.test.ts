import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { users, wallets, loyaltyRates, loyaltyLedger, auditOutbox } from "@bm/db";
import {
  getEffectiveRates,
  setRate,
  pointsForSpend,
  kesForPoints,
  earnPointsV2 as earnPoints,
} from "./index.js";

// ── pure conversion helpers (no DB) ────────────────────────────────────────

describe("pointsForSpend (pure, integer-cents)", () => {
  it("earns 1 point per earnRate KES of spend, floored", () => {
    expect(pointsForSpend(10000, 100)).toBe(1); // 100 KES -> 1 pt
    expect(pointsForSpend(25000, 100)).toBe(2); // 250 KES -> 2 pts (floor)
    expect(pointsForSpend(9999, 100)).toBe(0); // < 100 KES -> 0
    expect(pointsForSpend(0, 100)).toBe(0);
  });

  it("has no float drift on awkward values", () => {
    expect(pointsForSpend(30001, 100)).toBe(3);
    expect(pointsForSpend(2100, 7)).toBe(3); // 21 KES / 7 -> 3
    expect(pointsForSpend(2099, 7)).toBe(2);
  });

  it("rejects bad inputs", () => {
    expect(() => pointsForSpend(-1, 100)).toThrow();
    expect(() => pointsForSpend(100, 0)).toThrow();
    expect(() => pointsForSpend(1.5, 100)).toThrow();
  });
});

describe("kesForPoints (pure, integer-cents)", () => {
  it("converts points to cents at redeemRate", () => {
    expect(kesForPoints(5, 1)).toBe(500); // 5 pts * 1 KES = 5 KES = 500c
    expect(kesForPoints(0, 1)).toBe(0);
    expect(kesForPoints(3, 2)).toBe(600);
  });

  it("rejects bad inputs", () => {
    expect(() => kesForPoints(-1, 1)).toThrow();
    expect(() => kesForPoints(5, 0)).toThrow();
  });
});

// ── effective-dated rate selection (DB) ─────────────────────────────────────

let dbh: TestDb;
let adminId: string;

beforeEach(async () => {
  dbh = await createTestDb();
  const [u] = await dbh.db
    .insert(users)
    .values({ phone: "+254700000099", pinHash: "x" })
    .returning();
  adminId = u!.id;
});
afterEach(async () => {
  await dbh.close();
});

describe("getEffectiveRates", () => {
  it("returns the seeded defaults (AC1: earn 100, redeem 1)", async () => {
    const rates = await getEffectiveRates(dbh.db);
    expect(rates).toEqual({ earnRate: 100, redeemRate: 1 });
  });

  it("picks the latest row with effective_from <= at (effective-dating, AC2)", async () => {
    await setRate(dbh.db, {
      rateType: "earn",
      value: 50,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      actor: adminId,
    });
    // before the change -> still default 100
    const before = await getEffectiveRates(dbh.db, new Date("2026-01-01T00:00:00Z"));
    expect(before.earnRate).toBe(100);
    // after the change -> 50
    const after = await getEffectiveRates(dbh.db, new Date("2026-06-01T00:00:00Z"));
    expect(after.earnRate).toBe(50);
  });
});

describe("setRate", () => {
  it("appends a new row and never mutates prior rows (AC2)", async () => {
    await setRate(dbh.db, {
      rateType: "earn",
      value: 50,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      actor: adminId,
    });
    const rows = await dbh.db
      .select()
      .from(loyaltyRates)
      .where(eq(loyaltyRates.rateType, "earn"));
    expect(rows).toHaveLength(2); // seed (100) + new (50)
    const seed = rows.find((r) => r.value === 100);
    expect(seed).toBeDefined(); // prior row unchanged
  });

  it("audits loyalty.rate_change", async () => {
    await setRate(dbh.db, { rateType: "redeem", value: 2, actor: adminId });
    const logs = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "loyalty.rate_change"));
    expect(logs).toHaveLength(1);
  });

  it("rejects an invalid rate value", async () => {
    await expect(
      setRate(dbh.db, { rateType: "earn", value: 0, actor: adminId }),
    ).rejects.toThrow();
  });

  it("does NOT change historical loyalty_ledger rows when a rate changes (AC2)", async () => {
    const [w] = await dbh.db.insert(wallets).values({ userId: adminId }).returning();
    // earn under rate A (100): 250 KES spend -> 2 points
    const ratesA = await getEffectiveRates(dbh.db);
    const ptsA = pointsForSpend(25000, ratesA.earnRate);
    await earnPoints(dbh.db, {
      walletId: w!.id,
      points: ptsA,
      rateSnapshot: ratesA.earnRate,
      sourceType: "topup",
      sourceId: "saleA",
      idempotencyKey: "earn:saleA",
    });
    // change earn rate to 50
    await setRate(dbh.db, { rateType: "earn", value: 50, actor: adminId });
    // the earned row is unchanged: still 2 points at snapshot 100
    const [row] = await dbh.db
      .select()
      .from(loyaltyLedger)
      .where(eq(loyaltyLedger.sourceId, "saleA"));
    expect(row!.points).toBe(2);
    expect(row!.rateSnapshot).toBe(100);
  });
});
