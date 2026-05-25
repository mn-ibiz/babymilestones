import { afterEach, describe, expect, it, vi } from "vitest";
import type { WalletOverviewResponse } from "@bm/contracts";
import { fetchWalletOverview } from "./wallet-api";

describe("parent wallet-api (P1-E11-S01)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps the wallet overview on 200", async () => {
    const body: WalletOverviewResponse = {
      wallet: {
        balanceCents: 70_000,
        outstandingCents: 50_000,
        autoCreditEnabled: true,
        loyaltyPoints: 0,
        recentTransactions: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const wallet = await fetchWalletOverview();
    expect(wallet.balanceCents).toBe(70_000);
    expect(wallet.autoCreditEnabled).toBe(true);
  });

  it("throws the API error message on a failure response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Wallet not found" }), { status: 404 })),
    );
    await expect(fetchWalletOverview()).rejects.toThrow("Wallet not found");
  });
});
