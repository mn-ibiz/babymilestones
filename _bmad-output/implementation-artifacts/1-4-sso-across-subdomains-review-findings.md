# Review findings — 1-4-sso-across-subdomains (P1-E01-S04)

Self-review, 2026-05-25. BLOCKER/high: none. Lower-severity items logged here (no fix this story).

## Low

- **L1 — CSRF token compared with `!==` (non-constant-time).** In `validateSession` and
  `apps/api/src/routes/auth/logout.ts` the double-submit token is matched with a plain
  string compare. This is acceptable: in double-submit CSRF the attacker supplies both the
  cookie and header and the check is only that they equal each other (not a comparison
  against a server-held secret), so timing leakage is not exploitable. Could switch to
  `crypto.timingSafeEqual` for defence-in-depth if the pattern ever changes.

- **L2 — Edge middleware gates on session presence only.** The Next.js `middleware.ts` in
  `platform`/`pos`/`admin` redirects unauthenticated visitors to `/login` but does not
  resolve the opaque token → role at the edge, because that requires the shared (Redis)
  session store, which is deferred per the story Dev Notes. Role enforcement (AC4) runs in
  the API via `guardRole`. When Redis lands, wire the apps to call the API (or read Redis)
  so role mismatch can be enforced at the edge too. Allowed-role sets are already exported
  (`POS_ALLOWED_ROLES`, `ADMIN_ALLOWED_ROLES`) for that wiring.

- **L3 — `session.touch()` TTL extension is a documented no-op.** The in-memory store has no
  TTL; touch-on-request is wired with Redis (deferred). Tracked in code comments.
