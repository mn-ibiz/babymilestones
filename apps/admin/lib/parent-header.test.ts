import { describe, expect, it } from "vitest";
import { parentHeaderViewModel } from "./parent-header";
import type { ParentProfileSummary } from "@bm/contracts";

/**
 * P1-E05-S02 — parent-header view logic. Pure + dependency-free so it unit-tests
 * without a DOM and never pulls server-only code into the bundle. Covers the
 * "outstanding red when > 0" rule (AC1), full-phone display (AC1), formatted
 * money, and that the auto-credit control is admin-only actionable (AC1).
 */
const base: ParentProfileSummary = {
  userId: "u1",
  firstName: "Asha",
  lastName: "Mwangi",
  phone: "+254712345678",
  walletBalanceCents: 30_000,
  outstandingCents: 0,
  autoCreditEnabled: false,
};

describe("parentHeaderViewModel (P1-E05-S02)", () => {
  it("shows full name and full phone, and formatted balance (AC1)", () => {
    const vm = parentHeaderViewModel(base, "reception");
    expect(vm.fullName).toBe("Asha Mwangi");
    expect(vm.phone).toBe("+254712345678"); // full, never masked in the header
    expect(vm.balanceLabel).toBe("KES 300.00");
  });

  it("outstanding renders neutral (not red) when zero (AC1)", () => {
    const vm = parentHeaderViewModel({ ...base, outstandingCents: 0 }, "reception");
    expect(vm.outstandingIsRed).toBe(false);
    expect(vm.outstandingLabel).toBe("KES 0.00");
  });

  it("outstanding renders red when > 0 (AC1)", () => {
    const vm = parentHeaderViewModel({ ...base, outstandingCents: 7_500 }, "reception");
    expect(vm.outstandingIsRed).toBe(true);
    expect(vm.outstandingLabel).toBe("KES 75.00");
  });

  it("auto-credit control is actionable only for admins (AC1)", () => {
    expect(parentHeaderViewModel(base, "reception").autoCredit.actionable).toBe(false);
    expect(parentHeaderViewModel(base, "admin").autoCredit.actionable).toBe(true);
    expect(parentHeaderViewModel({ ...base, autoCreditEnabled: true }, "admin").autoCredit.checked).toBe(
      true,
    );
  });
});
