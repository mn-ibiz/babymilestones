import { mapStaffAuthError, type StaffAuthError, type StaffLoginDraft } from "./staff-login.js";
import { readCsrfToken } from "./csrf.js";

/**
 * Staff sign-in wiring for the POS login page (P2-E04-S01).
 *
 * Calls `POST /auth/staff/login` with `credentials: "include"` so the opaque-
 * token SSO session cookie (scoped to `.babymilestones.co.ke`, P1-E01-S04) is
 * set by the server on success. On failure the status is mapped to display
 * state via {@link mapStaffAuthError} so messaging matches the API. The API is
 * the sole authority on credentials and on whether the role may use the POS.
 */
export type StaffAuthResult =
  | { ok: true; role: string }
  | { ok: false; error: StaffAuthError };

export async function submitStaffSignIn(draft: StaffLoginDraft): Promise<StaffAuthResult> {
  const res = await fetch("/auth/staff/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: draft.phone, pin: draft.pin }),
  });
  if (res.ok) {
    // The API returns { role, redirect, csrfToken }; the role drives the in-app
    // landing so a staff role with no POS access is sent straight to /forbidden
    // rather than flashing through the sale screen.
    const body = (await res.json().catch(() => null)) as { role?: unknown } | null;
    const role = typeof body?.role === "string" ? body.role : "";
    return { ok: true, role };
  }
  const raw = await res.json().catch(() => null);
  return { ok: false, error: mapStaffAuthError(res.status, raw) };
}

/**
 * Sign out the current operator (P1-E01-S04 AC3). Clears the SSO session by
 * calling `POST /auth/logout` with the CSRF double-submit token; the API
 * responds with the cookie-clearing `set-cookie`. Resolves whether or not the
 * call succeeded — the caller navigates to /login regardless so a shared till
 * never strands the previous operator's session on screen.
 */
export async function submitLogout(): Promise<void> {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
      body: "{}",
    });
  } catch {
    // Best-effort: navigation to /login follows regardless.
  }
}
