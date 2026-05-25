/**
 * Route guard for the admin console (P1-E10-S01 AC2).
 *
 * Wraps the pure `canAccessRoute` predicate (`lib/nav.ts`, itself a mirror of the
 * `@bm/auth` RBAC matrix) into a discriminated outcome the `(console)` layout
 * acts on: allow the segment, or short-circuit to the 403 `/forbidden` page.
 *
 * Direct-URL navigation to a forbidden segment must render the 403 view rather
 * than bouncing — and the 403 page itself must always be reachable so we never
 * create a redirect loop. `canAccessRoute` whitelists `/forbidden`, so guarding
 * it returns `ok` and the loop cannot form.
 *
 * Dependency-free (mirrors the rest of `apps/admin/lib`) so it unit-tests without
 * a DOM and never pulls the native argon2 binding into the Next bundle. The API
 * re-checks every permission authoritatively; this is the render-time gate.
 */
import { canAccessRoute } from "./nav.js";

/** The 403 destination. Always reachable (see `nav.ALWAYS_ALLOWED`). */
export const FORBIDDEN_PATH = "/forbidden";

export type RouteGuardOutcome =
  | { ok: true }
  | { ok: false; status: 403; redirectTo: typeof FORBIDDEN_PATH };

/**
 * Decide whether `role` may render `path`. On denial, the caller renders (or
 * navigates to) the 403 `/forbidden` view with its "Switch role" link.
 */
export function guardRoute(role: string, path: string): RouteGuardOutcome {
  if (canAccessRoute(role, path)) {
    return { ok: true };
  }
  return { ok: false, status: 403, redirectTo: FORBIDDEN_PATH };
}
