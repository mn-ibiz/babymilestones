import { describe, expect, it } from "vitest";
import type { ReconciliationResponse } from "@bm/contracts";
import {
  canPostAdjustment,
  canApproveAdjustment,
  canApprovePosted,
  reconciliationRowViewModel,
  reconciliationViewModel,
} from "./reconciliation";

const row = (over: Partial<ReconciliationResponse["rows"][number]> = {}) => ({
  floatAccountId: "fa-1",
  name: "Till",
  kind: "mpesa_till",
  systemCents: 50_000,
  realCents: 50_000,
  driftCents: 0,
  isDrifting: false,
  ...over,
});

describe("Reconciliation screen logic (P1-E06-S02)", () => {
  it("admin + treasury may post; reception may not (AC3)", () => {
    expect(canPostAdjustment("admin")).toBe(true);
    expect(canPostAdjustment("treasury")).toBe(true);
    expect(canPostAdjustment("reception")).toBe(false);
  });

  it("only treasury/super_admin may approve (AC3)", () => {
    expect(canApproveAdjustment("treasury")).toBe(true);
    expect(canApproveAdjustment("super_admin")).toBe(true);
    expect(canApproveAdjustment("admin")).toBe(false);
  });

  it("enforces dual-approval — no self-approval (AC3)", () => {
    // Treasury user u1 posted it → u1 cannot approve their own.
    expect(canApprovePosted("u1", "treasury", "u1")).toBe(false);
    // A different treasury user u2 can.
    expect(canApprovePosted("u2", "treasury", "u1")).toBe(true);
    // An admin (no approve grant) never can.
    expect(canApprovePosted("u2", "admin", "u1")).toBe(false);
  });

  it("formats the three columns; placeholder while real is unentered (AC1)", () => {
    const vm = reconciliationRowViewModel(row({ realCents: null, driftCents: null }));
    expect(vm.systemLabel).toBe("KES 500.00");
    expect(vm.realLabel).toBe("—");
    expect(vm.driftLabel).toBe("—");
    expect(vm.driftIsRed).toBe(false);
  });

  it("renders drift red only when it trips the threshold (AC2)", () => {
    expect(reconciliationRowViewModel(row({ driftCents: 10_000, isDrifting: false })).driftIsRed).toBe(
      false,
    );
    expect(reconciliationRowViewModel(row({ driftCents: 10_001, isDrifting: true })).driftIsRed).toBe(
      true,
    );
  });

  it("shows the banner with a count when any account drifts (AC2)", () => {
    const res: ReconciliationResponse = {
      asOf: "2026-05-25",
      rows: [row({ isDrifting: false }), row({ floatAccountId: "fa-2", driftCents: 20_000, isDrifting: true })],
      hasDrift: true,
    };
    const vm = reconciliationViewModel(res);
    expect(vm.showDriftBanner).toBe(true);
    expect(vm.bannerMessage).toContain("1 account");
    expect(vm.rows).toHaveLength(2);
  });

  it("hides the banner when nothing drifts (AC2)", () => {
    const res: ReconciliationResponse = { asOf: "2026-05-25", rows: [row()], hasDrift: false };
    const vm = reconciliationViewModel(res);
    expect(vm.showDriftBanner).toBe(false);
    expect(vm.bannerMessage).toBeNull();
  });
});
