import type { LoyaltyAccountResponse } from "@bm/contracts";

/**
 * Parent loyalty account client (P2-E05-S04). Dependency-free so it unit-tests
 * without a DOM and never pulls server-only code into the Next bundle. Reads the
 * authed parent's OWN loyalty snapshot (balance, lifetime earned/redeemed,
 * history, redemption quote) from `GET /parents/me/loyalty`.
 */
export async function fetchLoyaltyAccount(): Promise<LoyaltyAccountResponse> {
  const res = await fetch("/parents/me/loyalty", { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load loyalty points (${res.status})`);
  }
  return (await res.json()) as LoyaltyAccountResponse;
}
