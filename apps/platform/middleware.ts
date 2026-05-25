import { NextResponse, type NextRequest } from "next/server";

/**
 * SSO edge guard for the parent platform app (P1-E01-S04).
 *
 * The single source of truth for session validation, CSRF, and role checks is
 * `@bm/auth`'s `validateSession`/`guardRole` (consumed by `apps/api`). This edge
 * middleware is the thin per-app entry point: it reads the shared `bm_session`
 * cookie (scoped to `.babymilestones.co.ke`) and, when absent, bounces to login
 * so an unauthenticated visitor is never shown an app surface.
 *
 * Kept dependency-free (no `@bm/auth` import) so the Next bundle never pulls the
 * native argon2 binding — mirrors `lib/role-landing.ts`. The opaque-token →
 * role resolution runs in the API against the shared (Redis) session store; the
 * Redis wiring is deferred (see story Dev Notes), so role gating for this
 * surface is delegated to the API on data calls.
 */
const SESSION_COOKIE_NAME = "bm_session";

/** Path prefixes that never require a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot", "/_next", "/favicon.ico"];

/**
 * The marketing home (P1-E12-S01) lives at the exact root `/` in the public
 * route group and must render for first-time, unauthenticated visitors. The
 * authed dashboard now lives at `/home`, so `/` is matched exactly (not as a
 * prefix, which would expose every path).
 */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) {
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
  // Run on everything except Next internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
