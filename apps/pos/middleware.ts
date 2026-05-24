import { NextResponse, type NextRequest } from "next/server";

/**
 * SSO edge guard for the POS operator app (P1-E01-S04).
 *
 * Source of truth for session validation, CSRF, and role checks is `@bm/auth`'s
 * `validateSession`/`guardRole` (consumed by `apps/api`). This edge middleware
 * reads the shared `bm_session` cookie (scoped to `.babymilestones.co.ke`) and
 * bounces unauthenticated visitors to login.
 *
 * Dependency-free (no `@bm/auth` import) to keep the native argon2 binding out
 * of the Next bundle. POS is an operator surface: roles allowed here are the
 * till-facing staff roles below. Role enforcement (AC4) runs in the API against
 * the shared session store via `guardRole`; the Redis store wiring is deferred
 * (see story Dev Notes), so the edge layer only gates on session presence and
 * the API rejects role mismatches (403 + redirect home).
 */
const SESSION_COOKIE_NAME = "bm_session";

/** Roles whose people work inside the POS surface (for the API role guard). */
export const POS_ALLOWED_ROLES = ["reception", "cashier", "packer"] as const;

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
