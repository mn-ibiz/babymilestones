import { NextResponse, type NextRequest } from "next/server";

/**
 * SSO edge guard for the admin console app (P1-E01-S04).
 *
 * Source of truth for session validation, CSRF, and role checks is `@bm/auth`'s
 * `validateSession`/`guardRole` (consumed by `apps/api`). This edge middleware
 * reads the shared `bm_session` cookie (scoped to `.babymilestones.co.ke`) and
 * bounces unauthenticated visitors to login.
 *
 * Dependency-free (no `@bm/auth` import) to keep the native argon2 binding out
 * of the Next bundle — mirrors `lib/role-landing.ts`. Admin is restricted to the
 * admin-family roles below; a parent landing here is a role mismatch (AC4) and
 * the API returns 403 + redirect home via `guardRole`. The opaque-token → role
 * resolution runs in the API against the shared (Redis) session store, whose
 * wiring is deferred (see story Dev Notes); the edge layer gates on session
 * presence only.
 */
const SESSION_COOKIE_NAME = "bm_session";

/** Roles allowed on the admin surface (for the API role guard, AC4). */
export const ADMIN_ALLOWED_ROLES = ["admin", "super_admin", "treasury", "accountant"] as const;

const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
