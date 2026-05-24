/**
 * Visible impersonation banner (P1-E01-S06 AC3).
 *
 * When a super_admin is acting as another user (`actAs` in `@bm/auth`), the API
 * marks the response with the `x-bm-acting-as` header. The admin shell renders
 * a persistent banner so impersonation is ALWAYS visible — there is no silent
 * "act as" mode. Kept dependency-free (mirrors role-landing.ts) so the Next
 * bundle never pulls the native argon2 binding from `@bm/auth`.
 */

/** Header the API sets to the impersonated user id while acting-as is active. */
export const ACTING_AS_HEADER = "x-bm-acting-as";

export interface BannerState {
  /** Whether the impersonation banner should be shown. */
  active: boolean;
  /** Banner copy to display, or null when not impersonating. */
  message: string | null;
}

/**
 * Derive the banner state from the acting-as header value. An empty/absent
 * value means no impersonation is in effect.
 */
export function impersonationBanner(actingAsUserId: string | null | undefined): BannerState {
  const id = (actingAsUserId ?? "").trim();
  if (!id) {
    return { active: false, message: null };
  }
  return {
    active: true,
    message: `You are acting as user ${id}. Actions are logged under your real account. Exit impersonation to stop.`,
  };
}
