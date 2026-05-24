/**
 * Shared session-validation guard (P1-E01-S04 — SSO across subdomains).
 *
 * Single source of truth consumed by `apps/api` (Fastify) and the Next.js apps
 * (`platform`, `pos`, `admin`). It reads the opaque `bm_session` cookie, looks
 * the token up in the {@link SessionStore}, resolves the user's id + role, and
 * either attaches the authenticated principal or rejects (401). It also
 * enforces the CSRF double-submit cookie token on state-changing verbs (AC5)
 * and offers a role guard for app/role mismatches (AC4).
 *
 * Framework-agnostic on purpose: the apps pass in the raw request bits
 * (cookie header, method, CSRF header) plus a `resolveUser` callback that maps
 * a session's `userId` to its current role from `users` — role is read live so
 * a role change invalidates access immediately (no JWT staleness).
 */
import {
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
} from "./session.js";
import type { SessionStore } from "./session.js";
import { landingForRole, type Role } from "./staff.js";

/** The authenticated principal attached to a request after a successful guard. */
export interface AuthenticatedUser {
  id: string;
  role: Role | string;
}

/** Verbs that mutate state and therefore require a valid CSRF token (AC5). */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Minimal request shape the guard needs — derivable from any framework. */
export interface GuardRequest {
  method: string;
  cookieHeader: string | undefined | null;
  csrfHeader: string | undefined | null;
}

export type GuardOutcome =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403; error: string };

/** Resolve a session's `userId` to its current role (live from `users`). */
export type ResolveUser = (userId: string) => Promise<{ id: string; role: string } | null>;

export interface ValidateSessionDeps {
  sessions: SessionStore;
  resolveUser: ResolveUser;
}

/**
 * Core guard: validate the session cookie (+ CSRF on mutating verbs) and
 * resolve the live user. Returns a discriminated outcome — callers map it onto
 * their framework's response. Used by both Fastify and Next.js wrappers.
 */
export async function validateSession(
  req: GuardRequest,
  { sessions, resolveUser }: ValidateSessionDeps,
): Promise<GuardOutcome> {
  const cookies = parseCookies(req.cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const session = await sessions.get(token);
  if (!session) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  // AC5: double-submit CSRF check on state-changing verbs. The cookie value
  // (readable by JS) must match the header the client echoes back. A missing
  // or mismatched token is rejected before any side effect runs.
  if (MUTATING_METHODS.has(req.method.toUpperCase())) {
    const cookieToken = cookies[CSRF_COOKIE_NAME];
    const headerToken = req.csrfHeader ?? "";
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return { ok: false, status: 403, error: "CSRF token missing or invalid" };
    }
  }

  // Role is resolved live so role changes / deletions take effect immediately.
  const user = await resolveUser(session.userId);
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  // session.touch() (TTL extension) is a no-op on the in-memory store and is
  // wired for Redis when the prod store lands (deferred — see Dev Notes).
  return { ok: true, user: { id: user.id, role: user.role } };
}

/**
 * Role guard (AC4): does this user's role belong on the requested app?
 * On a mismatch (e.g. a parent on `admin.*`), return a 403 plus the home path
 * the caller should redirect to. `allowedRoles` is the set the surface accepts.
 */
export interface RoleGuardResult {
  ok: boolean;
  status?: 403;
  redirect?: string;
  error?: string;
}

export function guardRole(
  user: AuthenticatedUser,
  allowedRoles: readonly string[],
): RoleGuardResult {
  if (allowedRoles.includes(user.role)) {
    return { ok: true };
  }
  // Send them back to where their own role belongs.
  return {
    ok: false,
    status: 403,
    redirect: landingForRole(user.role),
    error: "Forbidden for your role",
  };
}

export { CSRF_HEADER_NAME };
