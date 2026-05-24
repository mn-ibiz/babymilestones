# Story 12.4: Sign-in / sign-up entry points

Status: ready-for-dev

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

- [ ] Task 1: Public header CTAs (AC: #1)
  - [ ] Add "Sign in" + "Sign up" CTAs to the public header shared across all `apps/platform/app/(public)/` pages
- [ ] Task 2: Auth UI + intended-destination redirect (AC: #2, #3)
  - [ ] Build sign-in / sign-up pages under `apps/platform/app/(public)/(auth)/` using the parent phone + PIN flow via `@bm/auth`
  - [ ] Capture the intended destination (e.g. `?next=/book/talent`) and redirect there after successful auth
  - [ ] Establish the opaque-token SSO session (cookie domain `.babymilestones.co.ke`) on success
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: CTAs present on every public page; phone+PIN auth succeeds; post-auth redirect honours `next` destination (e.g. `/book/talent`). Use vitest, test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
