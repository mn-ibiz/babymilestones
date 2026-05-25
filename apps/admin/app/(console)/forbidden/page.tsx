import { FORBIDDEN_PATH } from "../../../lib/guard";

/**
 * 403 view (P1-E10-S01 AC2). Direct-URL access to a route the user's role may
 * not see short-circuits here (via `guardRoute` → `FORBIDDEN_PATH`). The page
 * renders a clear "no access" message plus a "Switch role" link so a multi-role
 * operator can re-authenticate as a role that holds the permission.
 *
 * `/forbidden` is itself whitelisted in `lib/nav` so guarding it returns `ok` —
 * the 403 page can never short-circuit to itself (no redirect loop).
 */
export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <main aria-labelledby="forbidden-title">
      <h1 id="forbidden-title">403 — Access denied</h1>
      <p>Your current role does not have permission to view this page.</p>
      <p>
        <a href="/switch-role" data-testid="switch-role">
          Switch role
        </a>
      </p>
      {/* Self-reference kept inert to document the no-loop guarantee. */}
      <span hidden data-forbidden-path={FORBIDDEN_PATH} />
    </main>
  );
}
