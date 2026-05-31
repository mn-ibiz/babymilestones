import { describe, it, expect } from "vitest";
import {
  loyaltyClawbackPoints,
  splitEarnAgainstCarry,
  availableToRedeem,
  loyaltyAdjustmentDelta,
  sumPendingClawback,
} from "./index.js";

/**
 * Pure loyalty math (P3-E04). Points are integer — no fractional points, no
 * float drift. These unit tests pin the clawback-proportion (S01) and
 * negative-carry (S02) arithmetic, plus the redemption-availability (S04) and
 * admin-adjustment (S03) helpers, independent of the DB.
 */
describe("loyaltyClawbackPoints — proportional integer clawback (S01)", () => {
  it("full refund claws back the full earn", () => {
    expect(loyaltyClawbackPoints(100, 30_000, 30_000)).toBe(100);
  });
  it("zero refund claws back nothing", () => {
    expect(loyaltyClawbackPoints(100, 0, 30_000)).toBe(0);
  });
  it("half refund claws back half", () => {
    expect(loyaltyClawbackPoints(100, 15_000, 30_000)).toBe(50);
  });
  it("rounds half to nearest (ties away from zero)", () => {
    expect(loyaltyClawbackPoints(7, 10_000, 30_000)).toBe(2); // 2.33 → 2
    expect(loyaltyClawbackPoints(7, 20_000, 30_000)).toBe(5); // 4.66 → 5
    expect(loyaltyClawbackPoints(1, 15_000, 30_000)).toBe(1); // 0.5 → 1
  });
  it("does not drift where naive float multiply would (333 × 0.1)", () => {
    // 333 * 0.1 === 33.300000000000004 in float; integer path yields exactly 33.
    expect(loyaltyClawbackPoints(333, 10_000, 100_000)).toBe(33);
  });
  it("clamps to [0, earned] and guards a non-positive original", () => {
    expect(loyaltyClawbackPoints(100, 40_000, 30_000)).toBe(100); // over-refund clamps
    expect(loyaltyClawbackPoints(0, 30_000, 30_000)).toBe(0);
    expect(loyaltyClawbackPoints(100, 30_000, 0)).toBe(0);
    expect(loyaltyClawbackPoints(100, 30_000, -1)).toBe(0);
  });
  it("returns an integer for any large input (no fractional points)", () => {
    const r = loyaltyClawbackPoints(999_999, 333_333, 1_000_000);
    expect(Number.isInteger(r)).toBe(true);
    expect(r).toBe(333_333); // 999999 * 333333 / 1000000 = 333332.66… → 333333
  });
});

describe("splitEarnAgainstCarry — negative carry repaid first (S02)", () => {
  it("non-negative balance: whole earn is spendable, nothing to carry", () => {
    expect(splitEarnAgainstCarry(0, 50)).toEqual({ appliedToCarry: 0, spendable: 50 });
    expect(splitEarnAgainstCarry(120, 50)).toEqual({ appliedToCarry: 0, spendable: 50 });
  });
  it("negative balance smaller than earn: repays carry, remainder spendable", () => {
    // balance -30, earn 50 → 30 repays carry, 20 spendable.
    expect(splitEarnAgainstCarry(-30, 50)).toEqual({ appliedToCarry: 30, spendable: 20 });
  });
  it("negative balance larger than earn: whole earn repays carry, 0 spendable", () => {
    expect(splitEarnAgainstCarry(-80, 50)).toEqual({ appliedToCarry: 50, spendable: 0 });
  });
  it("negative balance exactly equal to earn: fully repaid, 0 spendable", () => {
    expect(splitEarnAgainstCarry(-50, 50)).toEqual({ appliedToCarry: 50, spendable: 0 });
  });
  it("carry + spendable always sums to the earn (integer, no drift)", () => {
    for (const bal of [-100, -1, 0, 7, 999]) {
      for (const earn of [1, 33, 100]) {
        const { appliedToCarry, spendable } = splitEarnAgainstCarry(bal, earn);
        expect(appliedToCarry + spendable).toBe(earn);
        expect(Number.isInteger(appliedToCarry)).toBe(true);
        expect(Number.isInteger(spendable)).toBe(true);
      }
    }
  });
});

describe("availableToRedeem — respects pending settlement (S04)", () => {
  it("subtracts pending clawback from balance", () => {
    expect(availableToRedeem(100, 30)).toBe(70);
  });
  it("never goes below zero", () => {
    expect(availableToRedeem(20, 50)).toBe(0);
  });
  it("ignores negative pending and floors balance at zero", () => {
    expect(availableToRedeem(100, -5)).toBe(100);
    expect(availableToRedeem(-10, 0)).toBe(0);
  });
});

describe("loyaltyAdjustmentDelta — signed admin adjustment (S03)", () => {
  it("credit yields a positive delta", () => {
    expect(loyaltyAdjustmentDelta({ amount: 25, direction: "credit" })).toBe(25);
  });
  it("debit yields a negative delta", () => {
    expect(loyaltyAdjustmentDelta({ amount: 25, direction: "debit" })).toBe(-25);
  });
  it("rejects a non-positive or fractional amount", () => {
    expect(() => loyaltyAdjustmentDelta({ amount: 0, direction: "credit" })).toThrow();
    expect(() => loyaltyAdjustmentDelta({ amount: -5, direction: "credit" })).toThrow();
    expect(() => loyaltyAdjustmentDelta({ amount: 1.5, direction: "credit" })).toThrow();
  });
});

describe("sumPendingClawback — reducer over earn rows (S04)", () => {
  it("sums positive pending and ignores negatives", () => {
    expect(
      sumPendingClawback([
        { pendingClawback: 10 },
        { pendingClawback: 0 },
        { pendingClawback: 5 },
        { pendingClawback: -3 },
      ]),
    ).toBe(15);
  });
  it("is zero for an empty set", () => {
    expect(sumPendingClawback([])).toBe(0);
  });
});
