import { describe, expect, it } from "vitest";
import { computeVariance, isReasonRequired, varianceLabel } from "./cashup.js";

describe("POS cash-up helpers (P2-E04-S05)", () => {
  it("computes variance as counted − expected (AC2)", () => {
    expect(computeVariance(3200, 3000)).toBe(200);
    expect(computeVariance(2800, 3000)).toBe(-200);
    expect(computeVariance(3000, 3000)).toBe(0);
  });

  it("requires a reason only above the KES 500 threshold (AC3)", () => {
    expect(isReasonRequired(50_000)).toBe(false); // exactly 500 → no
    expect(isReasonRequired(50_001)).toBe(true);
    expect(isReasonRequired(-60_000)).toBe(true); // short by 600
    expect(isReasonRequired(0)).toBe(false);
  });

  it("labels the variance for the cashier", () => {
    expect(varianceLabel(0)).toMatch(/balanced/iu);
    expect(varianceLabel(200)).toMatch(/over.*2\.00/iu);
    expect(varianceLabel(-200)).toMatch(/short.*2\.00/iu);
  });
});
