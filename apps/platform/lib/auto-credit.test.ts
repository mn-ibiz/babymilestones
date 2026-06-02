import { describe, expect, it } from "vitest";
import type { WalletOverview } from "@bm/contracts";
import { autoCreditStatusViewModel } from "./auto-credit";

function overview(partial: Partial<WalletOverview> = {}): WalletOverview {
  return {
    balanceCents: 0,
    outstandingCents: 0,
    autoCreditEnabled: false,
    loyaltyPoints: 0,
    recentTransactions: [],
    ...partial,
  };
}

describe("autoCreditStatusViewModel (P2-E07-S03: read-only auto-credit visibility)", () => {
  it("AC1: enabled → admin-enabled status, no helper copy", () => {
    const vm = autoCreditStatusViewModel(overview({ autoCreditEnabled: true }));
    expect(vm.enabled).toBe(true);
    expect(vm.statusLabel).toBe("Auto-credit: Enabled by admin");
    expect(vm.helperText).toBeNull();
  });

  it("AC1/AC2: disabled → not-enabled status with the top-up helper copy", () => {
    const vm = autoCreditStatusViewModel(overview({ autoCreditEnabled: false }));
    expect(vm.enabled).toBe(false);
    expect(vm.statusLabel).toBe("Auto-credit: Not enabled");
    expect(vm.helperText).toBe(
      "Top up before booking to avoid an outstanding balance",
    );
  });

  it("fails quiet: a missing wallet reads as not enabled (safe default)", () => {
    const vm = autoCreditStatusViewModel(null);
    expect(vm.enabled).toBe(false);
    expect(vm.statusLabel).toBe("Auto-credit: Not enabled");
    expect(vm.helperText).toBe(
      "Top up before booking to avoid an outstanding balance",
    );
  });
});
