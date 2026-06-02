import { describe, expect, it } from "vitest";
import type { WalletOverview } from "@bm/contracts";
import { bannerOutstandingCents } from "./outstanding-banner";

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

describe("bannerOutstandingCents (P2-E07-S01: parent-dashboard outstanding banner gating)", () => {
  it("AC1: surfaces the owed amount when the wallet is loaded and owing", () => {
    expect(bannerOutstandingCents(overview({ outstandingCents: 50_000 }))).toBe(50_000);
  });

  it("AC3: reports nothing owed once the balance is settled (banner hides)", () => {
    expect(bannerOutstandingCents(overview({ outstandingCents: 0 }))).toBe(0);
  });

  it("fails quiet: reports nothing owed when the wallet failed to load", () => {
    expect(bannerOutstandingCents(null)).toBe(0);
    expect(bannerOutstandingCents(undefined)).toBe(0);
  });
});
