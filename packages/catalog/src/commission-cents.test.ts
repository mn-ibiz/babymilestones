import { describe, expect, it } from "vitest";
import { commissionCents } from "./commission-rates.js";

/**
 * P3-E01-S01/S02 — integer-cents commission math. Asserts no float drift and
 * half-up rounding on the final cent, across decimal-string and number rates.
 */
describe("commissionCents — integer-cents, no float drift", () => {
  it("computes a clean percentage", () => {
    expect(commissionCents(10000, "10.00")).toBe(1000); // 10% of 100.00
    expect(commissionCents(5000, "12.50")).toBe(625); // 12.5% of 50.00
    expect(commissionCents(0, "12.50")).toBe(0);
    expect(commissionCents(12345, "0")).toBe(0);
  });

  it("rounds half-up to whole cents", () => {
    expect(commissionCents(100, "33.33")).toBe(33); // 33.33 → 33
    expect(commissionCents(5, "12.50")).toBe(1); // 0.625 → 1
    expect(commissionCents(5, "10.00")).toBe(1); // 0.5 → 1
  });

  it("avoids classic float drift", () => {
    expect(commissionCents(33333, "15.00")).toBe(5000); // 4999.95 → 5000
  });

  it("accepts a numeric rate too", () => {
    expect(commissionCents(10000, 7.5)).toBe(750);
  });

  it("rejects non-integer base cents", () => {
    expect(() => commissionCents(100.5, "10.00")).toThrow();
  });
});
