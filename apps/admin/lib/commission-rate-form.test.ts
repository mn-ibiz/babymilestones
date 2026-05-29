import { describe, expect, it } from "vitest";
import {
  validateCommissionRateForm,
  ratePeriodLabel,
  isOpenRate,
  type CommissionRate,
} from "./commission-rate-form";

describe("commission-rate form validation (P3-E01-S01)", () => {
  it("requires a rate", () => {
    expect(validateCommissionRateForm({ ratePercent: "", effectiveFrom: "2026-01-01T00:00" }).ratePercent).toBeTruthy();
  });
  it("rejects an out-of-range rate", () => {
    expect(validateCommissionRateForm({ ratePercent: "150", effectiveFrom: "2026-01-01T00:00" }).ratePercent).toBeTruthy();
    expect(validateCommissionRateForm({ ratePercent: "-1", effectiveFrom: "2026-01-01T00:00" }).ratePercent).toBeTruthy();
  });
  it("requires a valid effective-from", () => {
    expect(validateCommissionRateForm({ ratePercent: "10", effectiveFrom: "" }).effectiveFrom).toBeTruthy();
    expect(validateCommissionRateForm({ ratePercent: "10", effectiveFrom: "not-a-date" }).effectiveFrom).toBeTruthy();
  });
  it("accepts a valid form", () => {
    const errs = validateCommissionRateForm({ ratePercent: "12.5", effectiveFrom: "2026-01-01T00:00" });
    expect(errs.ratePercent).toBeFalsy();
    expect(errs.effectiveFrom).toBeFalsy();
  });
});

describe("commission-rate history labels (P3-E01-S01)", () => {
  const open: CommissionRate = {
    id: "r1", staffId: "s1", ratePercent: "12.50",
    effectiveFrom: "2026-03-01T00:00:00.000Z", effectiveTo: null, reason: null,
  };
  const closed: CommissionRate = {
    id: "r0", staffId: "s1", ratePercent: "10.00",
    effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: "2026-03-01T00:00:00.000Z", reason: "raise",
  };

  it("labels open vs closed periods", () => {
    expect(ratePeriodLabel(open)).toBe("12.50% · 2026-03-01 → open");
    expect(ratePeriodLabel(closed)).toBe("10.00% · 2026-01-01 → 2026-03-01");
  });
  it("detects the open rate", () => {
    expect(isOpenRate(open)).toBe(true);
    expect(isOpenRate(closed)).toBe(false);
  });
});
