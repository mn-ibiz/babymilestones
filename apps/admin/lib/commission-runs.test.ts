import { describe, expect, it } from "vitest";
import {
  validateRunRange,
  formatCents,
  runLabel,
  isAwaitingPayout,
  type CommissionRun,
} from "./commission-runs";

describe("commission-run date range validation (P3-E01-S04)", () => {
  it("requires both dates", () => {
    expect(validateRunRange("", "2026-07-01").periodStart).toBeTruthy();
    expect(validateRunRange("2026-06-01", "").periodEnd).toBeTruthy();
  });
  it("rejects an inverted/equal range", () => {
    expect(validateRunRange("2026-07-01", "2026-06-01").periodEnd).toBeTruthy();
    expect(validateRunRange("2026-06-01", "2026-06-01").periodEnd).toBeTruthy();
  });
  it("accepts a valid range", () => {
    expect(validateRunRange("2026-06-01", "2026-07-01")).toEqual({});
  });
});

describe("commission-run display helpers (P3-E01-S04/S05)", () => {
  it("formats integer cents without float drift", () => {
    expect(formatCents(150000)).toBe("KES 1,500.00");
    expect(formatCents(625)).toBe("KES 6.25");
    expect(formatCents(5)).toBe("KES 0.05");
    expect(formatCents(0)).toBe("KES 0.00");
  });

  const run: CommissionRun = {
    id: "r1", kind: "ad_hoc",
    periodStart: "2026-06-01T00:00:00.000Z", periodEnd: "2026-06-15T00:00:00.000Z",
    totalCents: 150000, paidOutAt: null, createdAt: "2026-06-15T00:00:00.000Z",
  };

  it("labels a run and flags awaiting-payout", () => {
    expect(runLabel(run)).toContain("ad_hoc");
    expect(runLabel(run)).toContain("KES 1,500.00");
    expect(isAwaitingPayout(run)).toBe(true);
    expect(isAwaitingPayout({ ...run, paidOutAt: "2026-06-16T00:00:00.000Z" })).toBe(false);
    expect(runLabel({ ...run, paidOutAt: "2026-06-16T00:00:00.000Z" })).toContain("PAID OUT");
  });
});
