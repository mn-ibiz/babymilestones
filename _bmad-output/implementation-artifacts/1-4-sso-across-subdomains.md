# Story 1.4: SSO across subdomains

Status: ready-for-dev

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

- [ ] Task 1: Shared session middleware (AC: #1, #2, #4)
  - [ ] `packages/auth/src/middleware.ts` — read `bm_session` cookie, resolve opaque token from Redis, attach user+role to request; `session.touch()` extends TTL on each request
  - [ ] Role-guard helper: mismatch (e.g., parent on `admin.*`) → 403 with redirect to home
  - [ ] Wire middleware into `apps/platform`, `apps/pos`, `apps/admin` and `apps/api` (single source of truth)
- [ ] Task 2: Cookie domain consistency (AC: #1)
  - [ ] Ensure every login path (parent + staff) sets cookie domain `.babymilestones.co.ke` regardless of issuing app
- [ ] Task 3: Global logout (AC: #3)
  - [ ] `apps/api/src/routes/auth/logout.ts` — Redis `DEL` of the session token so all subdomains lose the session
- [ ] Task 4: CSRF protection (AC: #5)
  - [ ] Double-submit cookie token issued at session create; required + verified on POST/PUT/DELETE in `packages/auth/src/middleware.ts`
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] E2E: two tabs on different subdomains; logout in one invalidates the other within 5 seconds
  - [ ] Integration: cookie domain on login from each app; role-mismatch 403+redirect; CSRF rejection on mutating verbs without valid token

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
