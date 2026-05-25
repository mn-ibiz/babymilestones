/**
 * Server-side session/role resolution for the admin console shell (P1-E10-S01).
 *
 * The authoritative session → user/role resolution runs in `apps/api` against
 * the shared (Redis) session store keyed by the opaque `bm_session` cookie; that
 * wiring is deferred per the story Dev Notes. Until the admin app proxies that
 * lookup, the API forwards the resolved principal to the Next server on each
 * request via signed headers (`x-bm-user-id`, `x-bm-user-name`, `x-bm-role`),
 * exactly as it already forwards the impersonation banner header.
 *
 * This helper reads those headers (server-only) and returns the principal the
 * `(console)` layout renders the nav + header from. It is dependency-free and
 * never trusts the client beyond what the API attests; every action is still
 * re-authorized server-side in `apps/api`.
 */
import type { HeaderUser } from "./nav.js";

export const USER_ID_HEADER = "x-bm-user-id";
export const USER_NAME_HEADER = "x-bm-user-name";
export const ROLE_HEADER = "x-bm-role";

/** A minimal header bag (the subset of `Headers` we read). */
export interface HeaderBag {
  get(name: string): string | null;
}

/**
 * Resolve the signed-in principal from the API-attested request headers. Returns
 * null when no role is present (the edge middleware already bounced anonymous
 * visitors to /login, so this is a defensive null).
 */
export function resolvePrincipal(headers: HeaderBag): HeaderUser | null {
  const role = headers.get(ROLE_HEADER)?.trim();
  if (!role) return null;
  return {
    id: headers.get(USER_ID_HEADER)?.trim() || "unknown",
    name: headers.get(USER_NAME_HEADER)?.trim() || "",
    role,
  };
}
