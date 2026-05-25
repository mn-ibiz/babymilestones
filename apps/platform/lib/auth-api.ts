import { mapAuthError, type AuthApiError } from "./auth-form";

/**
 * Auth submit wiring for the public sign-in / sign-up pages (P1-E12-S04).
 *
 * Calls the parent auth API (signup 1-1 / login 1-2) with `credentials:
 * "include"` so the opaque-token SSO session cookie (scoped to
 * `.babymilestones.co.ke`) is set by the server on success. On failure the raw
 * API body is mapped to display state via {@link mapAuthError} so messaging
 * (weak-PIN, duplicate→login, invalid-credentials) matches the API verbatim.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; error: AuthApiError };

async function post(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const raw = (await res.json().catch(() => null)) as
    | { error?: string; field?: string; action?: string }
    | null;
  return { ok: false, error: mapAuthError(res.status, raw) };
}

/** POST /auth/signup — parent registration (phone + PIN + confirm). */
export function submitSignUp(input: {
  phone: string;
  pin: string;
  pinConfirm: string;
}): Promise<AuthResult> {
  return post("/auth/signup", input);
}

/** POST /auth/login — returning parent sign-in (phone + PIN). */
export function submitSignIn(input: { phone: string; pin: string }): Promise<AuthResult> {
  return post("/auth/login", input);
}
