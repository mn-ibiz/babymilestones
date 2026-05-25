import { describe, expect, it } from "vitest";
import {
  canManageFloatAccounts,
  canSubmitFloatAccount,
  floatKindLabel,
  kesToCents,
  validateFloatAccount,
  type FloatAccountFormValues,
} from "./float-accounts-form";

const valid: FloatAccountFormValues = {
  name: "M-Pesa Till 1",
  kind: "mpesa_till",
  openingBalanceKes: 0,
  openingDate: "2026-05-25",
};

describe("float-accounts-form (P1-E06-S01)", () => {
  it("gates management to admin/treasury (AC2)", () => {
    expect(canManageFloatAccounts("treasury")).toBe(true);
    expect(canManageFloatAccounts("admin")).toBe(true);
    expect(canManageFloatAccounts("super_admin")).toBe(true);
    expect(canManageFloatAccounts("reception")).toBe(false);
    expect(canManageFloatAccounts("parent")).toBe(false);
  });

  it("accepts a valid form", () => {
    const v = validateFloatAccount(valid);
    expect(v.ok).toBe(true);
    expect(canSubmitFloatAccount(v)).toBe(true);
  });

  it("requires a name, a kind, a non-negative balance and a valid date (AC1)", () => {
    expect(validateFloatAccount({ ...valid, name: "  " }).errors.name).toBeDefined();
    expect(validateFloatAccount({ ...valid, kind: "" }).errors.kind).toBeDefined();
    expect(
      validateFloatAccount({ ...valid, openingBalanceKes: -5 }).errors.openingBalanceKes,
    ).toBeDefined();
    expect(validateFloatAccount({ ...valid, openingDate: "25-05-2026" }).errors.openingDate).toBeDefined();
    expect(validateFloatAccount({ ...valid, openingDate: "2026-13-40" }).errors.openingDate).toBeDefined();
  });

  it("converts whole KES to integer cents", () => {
    expect(kesToCents(1500)).toBe(150_000);
    expect(kesToCents(0)).toBe(0);
  });

  it("labels kinds for display", () => {
    expect(floatKindLabel("mpesa_till")).toBe("M-Pesa till");
    expect(floatKindLabel("bank")).toBe("Bank account");
    expect(floatKindLabel("cash_drawer")).toBe("Cash drawer");
    expect(floatKindLabel("mystery")).toBe("mystery");
  });
});
