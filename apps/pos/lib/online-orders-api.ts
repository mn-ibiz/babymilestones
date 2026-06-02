import type { OnlineOrderCard } from "@bm/contracts";

/**
 * POS Online-orders read wiring (Story 29.1 / P4-E04-S01). Calls the API with
 * `credentials: "include"` so the SSO session cookie rides along. The endpoint is
 * GET + read-only — no CSRF. The API is the authority on the role gate AND on the
 * mirror-only read (AC5): this client never talks to WooCommerce.
 */

/** Fetch the Online-orders queue (cards New-first). Returns [] on any failure. */
export async function fetchOnlineOrders(): Promise<OnlineOrderCard[]> {
  try {
    const res = await fetch("/pos/online-orders", { credentials: "include" });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as { orders?: OnlineOrderCard[] } | null;
    return body?.orders ?? [];
  } catch {
    return [];
  }
}
