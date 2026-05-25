import { describe, expect, it } from "vitest";
import {
  computeDrift,
  isDrifting,
  hasReconciliationDrift,
  adjustingEntryCreateSchema,
  RECONCILIATION_DRIFT_THRESHOLD_CENTS,
  ADJUSTMENT_MAX_CENTS,
} from "./index.js";

describe("Reconciliation pure rules (P1-E06-S02)", () => {
  it("computeDrift is system − real (AC2)", () => {
    expect(computeDrift(50_000, 50_000)).toBe(0);
    expect(computeDrift(60_000, 50_000)).toBe(10_000); // system holds more
    expect(computeDrift(40_000, 50_000)).toBe(-10_000); // system holds less
  });

  it("threshold is KES 100 == 10_000 cents, strict greater-than (AC2)", () => {
    expect(RECONCILIATION_DRIFT_THRESHOLD_CENTS).toBe(10_000);
    expect(isDrifting(0)).toBe(false);
    expect(isDrifting(10_000)).toBe(false); // exactly KES 100 is within tolerance
    expect(isDrifting(-10_000)).toBe(false);
    expect(isDrifting(10_001)).toBe(true); // a single cent over trips it
    expect(isDrifting(-10_001)).toBe(true); // magnitude — negative drift trips too
  });

  it("hasReconciliationDrift trips when ANY row drifts (AC2)", () => {
    expect(hasReconciliationDrift([0, 5_000, -10_000])).toBe(false);
    expect(hasReconciliationDrift([0, 5_000, 10_001])).toBe(true);
    expect(hasReconciliationDrift([])).toBe(false);
  });

  it("accepts a valid adjusting entry (AC3)", () => {
    const ok = adjustingEntryCreateSchema.safeParse({
      floatAccountId: "11111111-1111-1111-1111-111111111111",
      amount: -2_500,
      reason: "Cash short at till close",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a zero, non-integer, or out-of-bounds amount (AC3)", () => {
    const base = { floatAccountId: "11111111-1111-1111-1111-111111111111", reason: "x" };
    expect(adjustingEntryCreateSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(adjustingEntryCreateSchema.safeParse({ ...base, amount: 1.5 }).success).toBe(false);
    expect(
      adjustingEntryCreateSchema.safeParse({ ...base, amount: ADJUSTMENT_MAX_CENTS + 1 }).success,
    ).toBe(false);
  });

  it("requires a reason and a UUID account (AC3)", () => {
    expect(
      adjustingEntryCreateSchema.safeParse({
        floatAccountId: "not-a-uuid",
        amount: 100,
        reason: "x",
      }).success,
    ).toBe(false);
    expect(
      adjustingEntryCreateSchema.safeParse({
        floatAccountId: "11111111-1111-1111-1111-111111111111",
        amount: 100,
        reason: "   ",
      }).success,
    ).toBe(false);
  });
});
