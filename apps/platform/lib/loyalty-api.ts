import type { LoyaltyAccountResponse } from "@bm/contracts";
import { apiFetch } from "./auth-api";

/**
 * Fetch the parent's loyalty account (P2-E05-S04): points balance, lifetime
 * earned/redeemed, history, and the redemption quote. Server component calls
 * this with the request cookie.
 */
export async function fetchLoyaltyAccount(
  cookie?: string,
): Promise<LoyaltyAccountResponse> {
  const res = await apiFetch("/parents/me/loyalty", { cookie });
  if (!res.ok) {
    throw new Error(`loyalty account failed: ${res.status}`);
  }
  return (await res.json()) as LoyaltyAccountResponse;
}
