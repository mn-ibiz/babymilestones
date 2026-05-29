import type { PosCashupExpected, PosCashupResponse } from "@bm/contracts";
import { readCsrfToken } from "./csrf.js";

/** Cash-up wiring (P2-E04-S05). */

/** GET the expected takings since this cashier's last close (AC1). */
export async function fetchExpected(): Promise<PosCashupExpected | null> {
  try {
    const res = await fetch("/pos/cashup/expected", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as PosCashupExpected;
  } catch {
    return null;
  }
}

export type CashupResult =
  | { ok: true; cashup: PosCashupResponse }
  | { ok: false; error: string };

/** POST the counted cash + optional reason to close the till (AC2/AC3/AC4). */
export async function submitCashup(countedCashCents: number, reason?: string): Promise<CashupResult> {
  try {
    const res = await fetch("/pos/cashup", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
      body: JSON.stringify({ countedCashCents, ...(reason ? { reason } : {}) }),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { ok: false, error: (json?.error as string) ?? "Cash-up failed" };
    return { ok: true, cashup: json as unknown as PosCashupResponse };
  } catch {
    return { ok: false, error: "Network error — please retry" };
  }
}
