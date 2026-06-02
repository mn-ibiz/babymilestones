import type { DispatchDetailRequest, OrderTransitionAction, WcLocalStatus } from "@bm/contracts";

/**
 * POS order-transition write wiring (Story 29.2 / P4-E04-S02). POSTs the tapped
 * action (and, for a dispatch, the rider/courier detail) to the API with
 * `credentials: "include"` so the SSO session cookie + CSRF token ride along. The
 * API is the authority on the state machine + the admin-only reversal rule (AC4);
 * this client just submits and reports the outcome.
 */

/** Read the CSRF token from the (non-HttpOnly) `bm_csrf` cookie for the header. */
function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

export type TransitionOutcome =
  | { ok: true; localStatus: WcLocalStatus }
  | { ok: false; status: number; error: string };

/** Submit one order-status transition. Returns the new local status on success. */
export async function submitOrderTransition(
  wooOrderId: number,
  action: OrderTransitionAction,
  dispatch?: DispatchDetailRequest,
): Promise<TransitionOutcome> {
  try {
    const res = await fetch(`/pos/online-orders/${wooOrderId}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
      body: JSON.stringify({ action, ...(dispatch ? { dispatch } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as
      | { localStatus?: WcLocalStatus; error?: string }
      | null;
    if (!res.ok) {
      return { ok: false, status: res.status, error: body?.error ?? "Transition failed" };
    }
    return { ok: true, localStatus: (body?.localStatus ?? "new") as WcLocalStatus };
  } catch {
    return { ok: false, status: 0, error: "Network error" };
  }
}
