/**
 * Paystack card top-up client for the parent dashboard (P1-E04-S04).
 * Framework-agnostic + dependency-free so it unit-tests without a DOM and never
 * pulls server-only code into the Next bundle. The top-up form consumes this to
 * initialize a hosted-checkout transaction (then redirects the browser to the
 * returned URL), and to verify on redirect-back. The Paystack PUBLIC key may be
 * referenced client-side; the SECRET key is server-only.
 */

import {
  PAYSTACK_MIN_KES,
  PAYSTACK_MAX_KES,
  type PaystackTxState,
} from "@bm/contracts";

export { PAYSTACK_MIN_KES, PAYSTACK_MAX_KES };
export type { PaystackTxState };

/** Client-side amount guard mirroring the contract bounds (AC1). */
export function validateAmount(amountKes: number): string | null {
  if (!Number.isInteger(amountKes)) return "Enter a whole number of shillings";
  if (amountKes < PAYSTACK_MIN_KES) return `Minimum top-up is KES ${PAYSTACK_MIN_KES}`;
  if (amountKes > PAYSTACK_MAX_KES) return `Maximum per top-up is KES ${PAYSTACK_MAX_KES}`;
  return null;
}

export interface PaystackInitResult {
  reference: string;
  authorizationUrl: string;
  state: PaystackTxState;
}

/** Initialize a Paystack card top-up for the authed parent's own wallet (AC1). */
export async function initPaystack(
  amountKes: number,
  saveCard: boolean,
  csrfToken: string,
): Promise<PaystackInitResult> {
  const res = await fetch("/payments/paystack/init", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ amountKes, saveCard }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Top-up failed (${res.status})`);
  }
  return (await res.json()) as PaystackInitResult;
}

/** Verify a transaction on redirect-back (AC2/AC3). */
export async function verifyPaystack(reference: string): Promise<PaystackTxState> {
  const res = await fetch(`/payments/paystack/verify/${encodeURIComponent(reference)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Verification failed (${res.status})`);
  }
  const json = (await res.json()) as { state: PaystackTxState };
  return json.state;
}

/** True once the transaction reaches a state the UI should stop polling on. */
export function isTerminalState(state: PaystackTxState): boolean {
  return state === "SUCCEEDED" || state === "FAILED" || state === "ABANDONED";
}
