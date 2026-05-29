/**
 * Server-side session/role resolution for the POS shell (P2-E04-S01).
 *
 * Mirrors `apps/admin/lib/session-context.ts`: the authoritative session →
 * user/role resolution runs in `apps/api` against the shared (Redis) session
 * store keyed by the opaque `bm_session` cookie; that wiring is deferred per the
 * story Dev Notes. Until the POS app proxies that lookup, the API forwards the
 * resolved principal to the Next server on each request via signed headers
 * (`x-bm-user-id`, `x-bm-user-name`, `x-bm-role`).
 *
 * This helper reads those headers (server-only) and returns the principal the
 * `(pos)` shell role-gates + renders the till header from. Dependency-free; it
 * never trusts the client beyond what the API attests, and every action is
 * re-authorised server-side in `apps/api`.
 */

export const USER_ID_HEADER = "x-bm-user-id";
export const USER_NAME_HEADER = "x-bm-user-name";
export const ROLE_HEADER = "x-bm-role";

/** The signed-in operator the POS shell renders + gates from. */
export interface PosPrincipal {
  id: string;
  name: string;
  role: string;
}

/** A minimal header bag (the subset of `Headers` we read). */
export interface HeaderBag {
  get(name: string): string | null;
}

/**
 * Resolve the signed-in principal from the API-attested request headers. Returns
 * null when no role is present (the edge middleware already bounced anonymous
 * visitors to /login, so this is a defensive null).
 */
export function resolvePrincipal(headers: HeaderBag): PosPrincipal | null {
  const role = headers.get(ROLE_HEADER)?.trim();
  if (!role) return null;
  return {
    id: headers.get(USER_ID_HEADER)?.trim() || "unknown",
    name: headers.get(USER_NAME_HEADER)?.trim() || "",
    role,
  };
}
