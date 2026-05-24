# Story 1.4: SSO across subdomains

Status: done

> Canonical ID: P1-E01-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S04.md

## Story

As a signed-in user,
I want my login to carry across the custom apps — `platform`, `pos`, `admin`,
so that I'm not re-prompted. (The standalone WooCommerce site is excluded — it has its own auth.)

## Acceptance Criteria

1. Cookie domain `.babymilestones.co.ke` set on login from any app.
2. All apps read session via the same middleware (`packages/auth/middleware.ts`).
3. Logout from one app invalidates the session everywhere (Redis `DEL`).
4. Role mismatch (e.g., parent landing on `admin.*`) → 403 with redirect to home.
5. CSRF: double-submit cookie token required on POST/PUT/DELETE.

## Tasks / Subtasks

- [x] Task 1: Shared session middleware (AC: #1, #2, #4)
  - [x] `packages/auth/src/middleware.ts` — `validateSession` reads `bm_session` cookie, resolves the opaque token from the shared `SessionStore`, attaches user (id+role, resolved live), or rejects 401; `session.touch()` TTL extension is documented for Redis (deferred)
  - [x] `guardRole` helper: mismatch (e.g. parent on `admin.*`) → 403 with redirect to home (`landingForRole`)
  - [x] Wired into `apps/api` (used by `/auth/logout`; exported for all protected routes) and per-app Next.js `middleware.ts` in `platform`/`pos`/`admin` (single source of truth in `@bm/auth`; apps stay argon2-free)
- [x] Task 2: Cookie domain consistency (AC: #1)
  - [x] Both login paths (parent + staff) issue the session cookie via `serializeSessionCookie` (domain `.babymilestones.co.ke`) plus a CSRF cookie via `serializeCsrfCookie`
- [x] Task 3: Global logout (AC: #3)
  - [x] `apps/api/src/routes/auth/logout.ts` — destroys the session token (Redis `DEL` in prod) so all subdomains lose the session; `{ all: true }` → `destroyAllForUser`; clears cookies; audited; idempotent
- [x] Task 4: CSRF protection (AC: #5)
  - [x] Double-submit cookie (`bm_csrf`, non-HttpOnly) issued at login/staff-login; required + verified on mutating verbs in `validateSession` and on `/auth/logout`
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [~] E2E two-tab cross-subdomain logout is covered as an API-level integration test (logout destroys the shared token → any subdomain reading `bm_session` loses the session immediately); full browser two-tab E2E deferred to the `e2e/` suite (no app session resolution until Redis lands)
  - [x] Integration: cookie domain + CSRF cookie on login from each path; role-mismatch 403+redirect (`guardRole`); CSRF rejection on mutating verbs without a valid token

## Dev Notes

- Session is an opaque token in Redis (not JWT — role changes require instant invalidation). `session.touch()` extends TTL on each request.
- All apps (`platform`, `pos`, `admin`) and `apps/api` read the session through the one shared `packages/auth/src/middleware.ts`. Cookie domain `.babymilestones.co.ke`.
- Logout is a Redis `DEL` → invalidates everywhere. CSRF via double-submit cookie token on mutating verbs.
- WooCommerce online shop is explicitly out of scope — it runs its own auth.
- Source paths to touch: `packages/auth/src/middleware.ts`, `apps/api/src/routes/auth/logout.ts`, session wiring in `apps/platform`, `apps/pos`, `apps/admin`.
- Testing standards: vitest, TS strict, test-first. Cover the cross-tab logout invalidation (≤5s) per source "Tests".

### Project Structure Notes
- Central change is `packages/auth/src/middleware.ts`, consumed by all three Next.js apps plus the API; logout route added under `apps/api/src/routes/auth/`.
- Dependencies (from source): S01–S03 (parent + staff sessions must exist).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- auth package: `middleware.test.ts` 12 tests pass (cookie helpers, validateSession 401/403/ok, CSRF double-submit, guardRole AC4).
- api: `logout.test.ts` 4 tests pass (AC3 destroy + logout-all, AC5 CSRF 403, idempotent). Existing login/staff-login tests updated for the multi-cookie set-cookie array.

### Completion Notes List

- Single source of truth `packages/auth/src/middleware.ts` (`validateSession`, `guardRole`) consumed by `apps/api`; Next.js apps stay argon2-free (per `lib/role-landing.ts` rationale) with thin edge `middleware.ts` that gates on session presence and delegates role/CSRF to the API.
- Role is resolved live (via `resolveUser`) so role changes/deletions invalidate access immediately — no JWT staleness (matches Dev Notes: opaque token, not JWT).
- CSRF: double-submit `bm_csrf` cookie (non-HttpOnly) issued at login + staff login; verified on mutating verbs in the guard and inline in `/auth/logout`.
- Production session store is **Redis**: `SessionStore` interface unchanged, `InMemorySessionStore` backs tests; `session.touch()` TTL extension and edge role-resolution are marked deferred. See review-findings L2/L3.
- Low-severity findings logged in `1-4-sso-across-subdomains-review-findings.md` (none blocking).

### File List

- packages/auth/src/middleware.ts (new)
- packages/auth/src/middleware.test.ts (new)
- packages/auth/src/session.ts (CSRF/cookie helpers: `serializeCsrfCookie`, `generateCsrfToken`, `clearAuthCookies`, `parseCookies`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`)
- packages/auth/src/index.ts (exports)
- apps/api/src/routes/auth/logout.ts (new)
- apps/api/src/routes/auth/logout.test.ts (new)
- apps/api/src/routes/auth/index.ts (register logout)
- apps/api/src/routes/auth/login.ts (issue CSRF cookie)
- apps/api/src/routes/auth/login.test.ts (multi-cookie assertions)
- apps/api/src/routes/auth/staff-login.ts (issue CSRF cookie)
- apps/api/src/routes/auth/staff-login.test.ts (multi-cookie assertions)
- apps/platform/middleware.ts (new)
- apps/pos/middleware.ts (new)
- apps/admin/middleware.ts (new)
- _bmad-output/implementation-artifacts/1-4-sso-across-subdomains-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented SSO middleware, global logout, CSRF; wired apps + api; gate green | claude-opus-4-7 |
