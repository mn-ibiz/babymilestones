import type { WalletOverview, WalletOverviewResponse } from "@bm/contracts";

/**
 * Parent wallet overview client (P1-E11-S01). Dependency-free so it unit-tests
 * without a DOM and never pulls server-only code into the Next bundle. Reads the
 * authed parent's OWN wallet snapshot (balance, outstanding, auto-credit,
 * loyalty, last-10 transactions) from the epic-3/11 read endpoint. CSV statement
 * download reuses the P1-E03-S08 export via `downloadStatement` in `statement-api`.
 */
export async function fetchWalletOverview(): Promise<WalletOverview> {
  const res = await fetch("/parents/me/wallet", { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load wallet (${res.status})`);
  }
  return ((await res.json()) as WalletOverviewResponse).wallet;
}
