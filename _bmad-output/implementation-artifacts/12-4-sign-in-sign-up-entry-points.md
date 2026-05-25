# Story 12.4: Sign-in / sign-up entry points

Status: done

> Canonical ID: P1-E12-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S04.md

## Story

As a visitor,
I want a clear way to sign in or create an account from anywhere on the marketing site,
so that I can authenticate without losing my place and continue to my intended destination.

## Acceptance Criteria

1. Header: "Sign in" + "Sign up" CTAs visible on all public pages.
2. After auth, redirect honours intended destination (e.g., back to `/book/talent`).
3. Auth UI uses the parent flow (phone + PIN).

## Tasks / Subtasks

- [x] Task 1: Public header CTAs (AC: #1)
  - [x] Add "Sign in" + "Sign up" CTAs to the public header shared across all `apps/platform/app/(public)/` pages (`PublicHeader` mounted in `(public)/layout.tsx`)
- [x] Task 2: Auth UI + intended-destination redirect (AC: #2, #3)
  - [x] Build sign-in / sign-up pages under `apps/platform/app/(public)/(auth)/` using the parent phone + PIN flow. (Note: wired to the auth API endpoints, NOT a direct `@bm/auth` import — `@bm/auth` pulls the native argon2 binding and must never enter the Next client bundle, per `middleware.ts`; validation messaging is mirrored from the API in the tested pure `auth-form.ts`.)
  - [x] Capture the intended destination (e.g. `?next=/book/talent`) and redirect there after successful auth (`resolvePostAuthDest` with an open-redirect guard)
  - [x] Establish the opaque-token SSO session (cookie domain `.babymilestones.co.ke`) on success — the API sets the `bm_session` cookie; the client posts with `credentials: "include"`
- [x] Task 3: Tests (AC: all)
  - [~] e2e (CTA-on-every-page render + full post-auth navigation) deferred: `apps/platform` has no jsdom/Playwright harness and the story's testing standard is vitest pure functions. AC1/AC2/AC3 are covered at the logic layer instead — `validateSignIn`/`validateSignUp`, `signInHref`/`signUpHref`, `resolvePostAuthDest`, `mapAuthError`, and the `submitSignIn`/`submitSignUp` wiring (32 tests). See review-findings #3.

## Dev Notes

- Marketing surface in `apps/platform` public route group (header CTAs + auth pages under `apps/platform/app/(public)/`). Auth uses the parent phone + PIN flow via `@bm/auth` (opaque-token SSO sessions, cookie domain `.babymilestones.co.ke`).
- Intended-destination redirect ties into the deep-link flow (P1-E12-S03, `/book/[unit]`).
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- Public header component + `apps/platform/app/(public)/(auth)/` sign-in/sign-up pages; auth via `@bm/auth`.
- Depends on P1-E01 (auth foundation) per source Dependencies; redirect target relates to P1-E12-S03.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E12.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test` (platform 137 tests incl. 26 new), `pnpm typecheck` (15/15), `pnpm lint` (15/15), `pnpm build` (5/5; `/login` + `/signup` prerendered static).

### Completion Notes List

- AC1: shared `PublicHeader` (Sign in + Sign up CTAs) mounted once in `(public)/layout.tsx` (Suspense-wrapped for `useSearchParams`), so the CTAs appear on every public page (`/`, per-unit pages, `/book/[unit]`, and the auth pages).
- AC2: the header carries the current location through as `?next=`; auth pages resolve it via the tested `resolvePostAuthDest`, which includes an open-redirect guard (rejects protocol-relative `//…`, absolute URLs, and `javascript:`) and defaults to `/home`.
- AC3: parent phone + PIN flow. Forms validate client-side via tested pure functions in `auth-form.ts` (phone normalisation, 4-digit PIN, weak-PIN, confirm-match — mirroring the API order/messages), then POST to `/auth/signup` and `/auth/login` with `credentials: "include"` so the API sets the opaque-token SSO session cookie. Error display is mapped from the API verbatim (`mapAuthError`), including the duplicate-phone → "go to sign in" steer (signup 1-1 AC2).
- Architectural note: deliberately NOT importing `@bm/auth` into the client bundle (it pulls native argon2) — mirrors the existing `middleware.ts` decision; the auth-rule constants are re-stated and unit-tested for parity.

### File List

- apps/platform/lib/auth-form.ts (new)
- apps/platform/lib/auth-form.test.ts (new)
- apps/platform/lib/auth-api.ts (new)
- apps/platform/lib/auth-api.test.ts (new)
- apps/platform/app/components/PublicHeader.tsx (new)
- apps/platform/app/components/SignInForm.tsx (new)
- apps/platform/app/components/SignUpForm.tsx (new)
- apps/platform/app/(public)/(auth)/login/page.tsx (new)
- apps/platform/app/(public)/(auth)/signup/page.tsx (new)
- apps/platform/app/(public)/layout.tsx (modified — mount PublicHeader)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)
- _bmad-output/implementation-artifacts/12-4-sign-in-sign-up-entry-points.md (modified)
- _bmad-output/implementation-artifacts/12-4-sign-in-sign-up-entry-points-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Sign-in/sign-up entry points: shared public header CTAs, phone+PIN auth pages wired to signup/login API with SSO session + intended-destination redirect; pure tested form logic | claude-opus-4-7 |
