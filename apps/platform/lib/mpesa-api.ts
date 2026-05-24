/**
 * M-Pesa STK push top-up client for the parent dashboard (P1-E04-S01).
 * Framework-agnostic + dependency-free so it unit-tests without a DOM and never
 * pulls server-only code into the Next bundle. The top-up form consumes this to
 * initiate a push and then poll the status endpoint until a terminal state.
 */

import { MPESA_STK_MIN_KES, MPESA_STK_MAX_KES, type MpesaStkState } from "@bm/contracts";

export { MPESA_STK_MIN_KES, MPESA_STK_MAX_KES };
export type { MpesaStkState };

/** Window the UI shows the "Check your phone…" indicator for (AC3). */
export const STK_PROGRESS_SECONDS = 90;

/** Client-side amount guard mirroring the contract bounds (AC1). */
export function validateAmount(amountKes: number): string | null {
  if (!Number.isInteger(amountKes)) return "Enter a whole number of shillings";
  if (amountKes < MPESA_STK_MIN_KES) return `Minimum top-up is KES ${MPESA_STK_MIN_KES}`;
  if (amountKes > MPESA_STK_MAX_KES) return `Maximum per top-up is KES ${MPESA_STK_MAX_KES}`;
  return null;
}

export interface StkInitiateResult {
  checkoutRequestId: string;
  state: MpesaStkState;
}

/** Initiate an STK push for the authed parent's own wallet (AC1/AC2). */
export async function initiateStkPush(
  amountKes: number,
  csrfToken: string,
): Promise<StkInitiateResult> {
  const res = await fetch("/payments/mpesa/stk", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ amountKes }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Top-up failed (${res.status})`);
  }
  return (await res.json()) as StkInitiateResult;
}

/** Fetch the current state of an STK request for live polling (AC4). */
export async function fetchStkStatus(checkoutRequestId: string): Promise<MpesaStkState> {
  const res = await fetch(`/payments/mpesa/stk/${encodeURIComponent(checkoutRequestId)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Status check failed (${res.status})`);
  }
  const json = (await res.json()) as { state: MpesaStkState };
  return json.state;
}

/** True once the STK request reaches a state the UI should stop polling on. */
export function isTerminalState(state: MpesaStkState): boolean {
  return state === "SUCCEEDED" || state === "FAILED";
}
