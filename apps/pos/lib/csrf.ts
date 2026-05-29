/**
 * CSRF double-submit token helpers (P2-E04-S01).
 *
 * The API sets a non-HttpOnly `bm_csrf` cookie on login; state-changing calls
 * (e.g. `POST /auth/logout`) must echo its value in the `x-csrf-token` header.
 * The cookie parsing is split out as a pure function so it is unit-tested
 * without a DOM (mirrors the established `apps/admin` lib convention).
 */

const CSRF_COOKIE_NAME = "bm_csrf";

/** Extract the `bm_csrf` value from a `document.cookie`-style string, or "". */
export function parseCsrfCookie(cookie: string): string {
  const match = cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/** Read the CSRF double-submit token from the browser cookie jar (client-only). */
export function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  return parseCsrfCookie(document.cookie);
}

export { CSRF_COOKIE_NAME };
