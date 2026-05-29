"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitLogout } from "../../lib/auth-api";

/**
 * Real sign-out for the shared in-store till (P2-E04-S01). Clears the SSO
 * session via `POST /auth/logout` (CSRF double-submit) before navigating to
 * /login, so the next operator can never resume the previous operator's
 * session. A plain link would only navigate and leave the cookie live.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await submitLogout();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="touch-target inline-flex items-center rounded-lg border border-ink/20 px-4 text-sm font-medium disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
