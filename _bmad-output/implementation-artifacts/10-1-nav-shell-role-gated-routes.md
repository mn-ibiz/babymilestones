# Story 10.1: Nav shell + role-gated routes

Status: ready-for-dev

> Canonical ID: P1-E10-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S01.md

## Story

As any logged-in staff user,
I want to see only the menus and pages my role can use,
so that I am never exposed to actions or data outside my permissions.

## Acceptance Criteria

1. Side nav rendered server-side from the user's permission set.
2. Direct-URL access to a forbidden route → 403 page with "Switch role" link.
3. Header shows: current user, role badge, current float status (green/red dot from P1-E06), logout.

## Tasks / Subtasks

- [ ] Task 1: Build the admin app shell layout in `apps/admin/app/(console)/layout.tsx` (AC: #1, #3)
  - [ ] Server component that resolves the session + permission set via `@bm/auth` role guards
  - [ ] Render `SideNav` server-side, filtering nav items against the resolved permission set
  - [ ] Render header bar: current user name, role badge, float status dot, logout action
- [ ] Task 2: Implement role-gated routing (AC: #2)
  - [ ] Add a route guard helper in `apps/admin/lib/guard.ts` wrapping `@bm/auth` guards per route segment
  - [ ] On forbidden access, render `apps/admin/app/(console)/forbidden/page.tsx` 403 view with a "Switch role" link
  - [ ] Ensure direct-URL navigation to a forbidden segment short-circuits to the 403 view (not a redirect loop)
- [ ] Task 3: Float status indicator in header (AC: #3)
  - [ ] Fetch float status from `apps/api` (P1-E06 surface) and render green/red dot
- [ ] Task 4: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: nav renders only permitted items per role; forbidden direct-URL → 403 with Switch role link; header shows user/role/float/logout. Use vitest, test-first.

## Dev Notes

- Anchors to `apps/admin` (Next.js app router). Nav and route gating derive from the user's permission set via `@bm/auth` (phone+PIN / opaque-token SSO sessions, role guards; cookie domain `.babymilestones.co.ke`).
- Nav must be rendered **server-side** from permissions — do not ship a client-only filter.
- Float status dot consumes the P1-E06 float surface exposed by `apps/api`.
- Source-tree paths to touch: `apps/admin/app/(console)/layout.tsx`, `apps/admin/app/(console)/forbidden/page.tsx`, `apps/admin/lib/guard.ts`, plus a `SideNav` component under `apps/admin/components/`.
- Testing standards: vitest (`pnpm test` in `apps/admin`), TS strict, test-first (red/green/refactor). Cover all three ACs as required by the source DoD (every AC has a passing test).

### Project Structure Notes
- Lives entirely in `apps/admin`; role logic delegated to `@bm/auth`. No new DB tables.
- Depends on P1-E01-S04 (auth/session) and S06 (float status) per source Dependencies.
- DoD: audited actions write to `audit_outbox`; migrations additive-only (none expected here).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E10.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
