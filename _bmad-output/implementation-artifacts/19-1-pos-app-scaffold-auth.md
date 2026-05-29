# Story 19.1: POS app scaffold + auth

Status: done

> Canonical ID: P2-E04-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S01.md

## Story

As cashier,
I want a POS app that I log into and start selling,
so that the capability described above is delivered.

## Acceptance Criteria

1. `apps/pos` Next.js app on `pos.babymilestones.co.ke`.
2. SSO from P1-E01-S04; role `cashier` lands directly on the sale screen.
3. Tablet-first layout, landscape ≥ 768px, large touch targets.

## Tasks / Subtasks

- [x] Task 1: Implement POS app scaffold + auth (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `apps/pos` Next.js app on `pos.babymilestones.co.ke`.
  - [x] Satisfy AC#2: SSO from P1-E01-S04; role `cashier` lands directly on the sale screen.
  - [x] Satisfy AC#3: Tablet-first layout, landscape ≥ 768px, large touch targets.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Findings

Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-05-29.
Acceptance Auditor: all 3 ACs PASS. No High/Medium violations of the ACs.

Patches (applied this session):
- [x] [Review][Patch] Restore pinch-zoom — removed `maximumScale: 1` (WCAG 1.4.4) [apps/pos/app/layout.tsx]
- [x] [Review][Patch] Realize AC3 landscape/width contract at runtime — `ViewportGuard` consumes `meetsTabletLayout`/`isLandscape` (were tested-but-unused) [apps/pos/lib/layout.ts, apps/pos/app/components/ViewportGuard.tsx, apps/pos/app/(pos)/layout.tsx]
- [x] [Review][Patch] Land non-POS staff correctly — `submitStaffSignIn` returns `role`; login routes via `posLanding(role) ?? FORBIDDEN_PATH` (no flash through `/`) [apps/pos/lib/auth-api.ts, apps/pos/app/login/page.tsx]
- [x] [Review][Patch] "Sign out" now actually signs out — client logout to `POST /auth/logout` w/ CSRF double-submit, then `/login` (shared-till session hygiene) [apps/pos/app/components/TillHeader.tsx → SignOutButton]
- [x] [Review][Patch] Login form UX — early-return while submitting (no double POST); clear field/form error on input change [apps/pos/app/components/StaffLoginForm.tsx]

Deferred:
- [x] [Review][Defer] Wire CSRF double-submit for authed POS mutations — deferred to S04 (no authed mutations in 19-1; the `bm_csrf` cookie is already set by the API at login)
- [x] [Review][Defer] `@bm/config` not declared in `apps/pos/package.json` — pre-existing, repo-wide (admin/platform identical); fix as a separate hygiene pass

Dismissed (rationale): header-attested principal + deferred session-store wiring (established pattern, byte-for-byte mirrors the shipped admin shell); relative `/auth/*` fetch (deployment proxy, matches platform); phone-whitespace normalization (mirrors platform); role case-sensitivity (role source is the canonical lowercase `users.role`); defensive `surfaceLabel` "Unknown" (mirrors admin); 403 message granularity (acceptable, avoids account-state leak); PIN `maxLength`/whitespace (correct for a 4-digit PIN); login→forbidden redirect-loop (disproven — `/forbidden` lives outside `(pos)`, `/login` is public).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- `pnpm --filter @bm/pos test` → 34 tests pass (5 files)
- `pnpm --filter @bm/pos typecheck` → clean
- `pnpm --filter @bm/pos lint` → clean
- `pnpm --filter @bm/pos build` → 6 routes built (`/`, `/login`, `/forbidden`, `/health/live`, `/health/ready`, `/_not-found`)

### Completion Notes List

- **AC#1** — `apps/pos` is a Next.js 15 app (`@bm/pos`, port 3001). The production host
  `pos.babymilestones.co.ke` is a deploy-time binding handled by the generic app-name
  deploy machinery (`infra/preview.sh` / `deploy.sh`), the same convention used by
  `@bm/admin` and `@bm/platform` — no per-app domain code exists or is needed. Tablet-first
  `globals.css` + viewport added.
- **AC#2** — SSO reuses the shared `bm_session` cookie (P1-E01-S04). The edge `middleware.ts`
  (already present) gates on session presence; the new `(pos)` server shell role-gates the
  whole surface via `guardPosAccess` and redirects non-POS roles to `/forbidden`. The sale
  screen is the root route `/`; `posLanding("cashier")` resolves there so the cashier lands
  directly on it. A staff login page (`/login`) posts to `POST /auth/staff/login` and routes
  to the sale screen on success.
- **AC#3** — `lib/layout.ts` is the single source of truth for the tablet breakpoint
  (`TABLET_MIN_WIDTH = 768`) and touch-target floor (`MIN_TOUCH_TARGET_PX = 48`); `globals.css`
  mirrors them (`.pos-shell` min-width 768px, `.touch-target` 48px). The shell + sale screen
  are a landscape two-pane layout; all interactive controls use `.touch-target`.
- Per the established pattern (`apps/admin/lib/*.test.ts`), only pure lib logic is unit-tested
  (role gating, landing, tablet constants, login validation, header-attested principal);
  React components stay thin renders over the tested lib. `@bm/auth` is deliberately NOT
  imported into the Next bundle (native argon2 binding) — the role list is mirrored in
  `lib/pos-access.ts`, exactly as `apps/admin/lib/role-landing.ts` does.
- No DB migration required (scaffold + auth only; session-store wiring deferred per Dev Notes,
  consistent with the admin/platform shells).

### File List

**Added**
- `apps/pos/app/globals.css`
- `apps/pos/app/(pos)/layout.tsx`
- `apps/pos/app/(pos)/page.tsx`
- `apps/pos/app/components/SaleScreen.tsx`
- `apps/pos/app/components/TillHeader.tsx`
- `apps/pos/app/components/StaffLoginForm.tsx`
- `apps/pos/app/components/ViewportGuard.tsx` _(review patch — AC3 runtime guard)_
- `apps/pos/app/components/SignOutButton.tsx` _(review patch — real logout)_
- `apps/pos/app/forbidden/page.tsx`
- `apps/pos/app/login/page.tsx`
- `apps/pos/lib/pos-access.ts`
- `apps/pos/lib/pos-access.test.ts`
- `apps/pos/lib/layout.ts`
- `apps/pos/lib/layout.test.ts`
- `apps/pos/lib/staff-login.ts`
- `apps/pos/lib/staff-login.test.ts`
- `apps/pos/lib/session-context.ts`
- `apps/pos/lib/session-context.test.ts`
- `apps/pos/lib/auth-api.ts`
- `apps/pos/lib/csrf.ts` _(review patch — CSRF token read for logout)_
- `apps/pos/lib/csrf.test.ts` _(review patch)_

**Modified**
- `apps/pos/app/layout.tsx` (import globals.css, tablet viewport, brand body classes; review patch removed `maximumScale:1`)

Tests: 43 pass across 6 lib test files. Full monorepo suite: 17/17 packages green, no regressions.

**Removed**
- `apps/pos/app/page.tsx` (placeholder; replaced by the `(pos)` route group's sale screen)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented POS shell, SSO role-gating, tablet-first layout + staff login (TDD, 34 tests) | Amelia (dev-story) |
| 2026-05-29 | 1.1 | Adversarial code review: 5 patches applied (zoom restore, AC3 runtime guard, posLanding routing, real logout, login UX), 2 deferred. 43 tests, full suite green → done | bmad-code-review |
