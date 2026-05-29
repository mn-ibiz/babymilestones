/**
 * POS access control + role landing (P2-E04-S01 AC2).
 *
 * The POS is an in-store operator surface. SSO is shared across subdomains via
 * the `bm_session` cookie (P1-E01-S04); the edge `middleware.ts` only gates on
 * session presence, and `apps/api` is the sole authority on the opaque-token →
 * role resolution. This module is the pure, dependency-free mirror of that role
 * gate so the shell + login pages can land the right operator on the right
 * screen and refuse everyone else without re-deriving auth logic.
 *
 * Kept free of any `@bm/auth` import so the native argon2 binding never enters
 * the Next bundle (mirrors `apps/admin/lib/role-landing.ts`). The API re-checks
 * every action regardless — this is the render-time gate.
 */

/** Roles whose people work inside the POS surface. */
export const POS_ROLES = ["reception", "cashier", "packer"] as const;

export type PosRole = (typeof POS_ROLES)[number];

const POS_ROLE_SET = new Set<string>(POS_ROLES);

/**
 * The cashier's landing surface: the active-sale ("New sale") screen at root.
 *
 * Note this is intentionally `/`, not the `@bm/auth` `landingForRole("cashier")`
 * value of `/cashier`. That P1 value is a hint for a single shared admin surface;
 * each per-subdomain app decides its own in-app landing, exactly as the platform
 * app ignores the API `redirect` and navigates to its own dashboard. There is no
 * `/cashier` route in this app — the POS *is* the cashier surface.
 */
export const SALE_SCREEN_PATH = "/";

/** The 403 destination for a signed-in user whose role may not use the POS. */
export const FORBIDDEN_PATH = "/forbidden";

/** True when `role` may work inside the POS (AC2). */
export function isPosRole(role: string): role is PosRole {
  return POS_ROLE_SET.has(role);
}

/**
 * Post-login landing path for a role. Every POS operator role (cashier first,
 * per AC2) lands directly on the sale screen; a non-POS role gets null — the
 * caller routes it to the 403 page rather than into the till.
 */
export function posLanding(role: string): string | null {
  return isPosRole(role) ? SALE_SCREEN_PATH : null;
}

export type PosAccessOutcome =
  | { ok: true }
  | { ok: false; status: 403; redirectTo: typeof FORBIDDEN_PATH };

/**
 * Decide whether `role` may render the POS. On denial the caller renders (or
 * redirects to) the 403 `/forbidden` view. The API re-authorises every action.
 */
export function guardPosAccess(role: string): PosAccessOutcome {
  if (isPosRole(role)) return { ok: true };
  return { ok: false, status: 403, redirectTo: FORBIDDEN_PATH };
}

/** Human label for the till-facing surface a POS role works on. */
export function surfaceLabel(role: string): string {
  switch (role) {
    case "reception":
      return "Reception";
    case "cashier":
      return "Cashier";
    case "packer":
      return "Packing";
    default:
      return "Unknown";
  }
}
