# Story 11.5: Bottom nav + mobile-first shell

Status: ready-for-dev

> Canonical ID: P1-E11-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S05.md

## Story

As a parent on a phone,
I want quick taps to Home / Wallet / Children / Profile,
so that I can move around the dashboard fast on a small screen.

## Acceptance Criteria

1. 4-tab bottom nav on mobile; sidebar on desktop.
2. All routes load < 1s on a throttled 3G fast profile.
3. Initial JS < 200 KB (gzipped).

## Tasks / Subtasks

- [ ] Task 1: ParentShellLayout compound in `packages/ui` (AC: #1)
  - [ ] Build `ParentShellLayout` compound: 4-tab bottom nav on mobile (Home / Wallet / Children / Profile), sidebar on desktop — responsive via the Tailwind preset
- [ ] Task 2: Wire shell into `apps/platform` authed route group (AC: #1, #2, #3)
  - [ ] Apply `ParentShellLayout` in `apps/platform/app/(app)/layout.tsx` wrapping Home/Wallet/Children/Profile routes
  - [ ] Use server components + code-splitting to keep initial JS lean; lazy-load non-critical client code
- [ ] Task 3: Performance budget verification (AC: #2, #3)
  - [ ] Add/verify a bundle-size budget check so initial JS stays < 200 KB gzipped
  - [ ] Verify route loads < 1s on a throttled 3G-fast profile
- [ ] Task 4: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: bottom nav renders 4 tabs on mobile, sidebar on desktop, active-tab state, navigation works; performance budget assertion (initial JS < 200 KB gz) and 3G-fast load-time check. Use vitest, test-first.

## Dev Notes

- `ParentShellLayout` compound lives in `packages/ui` (per source Technical Notes) and is consumed by the `apps/platform` authed route group layout, mobile-first. Responsiveness via the `packages/ui` Tailwind preset / `packages/config` brand tokens.
- Hard performance budgets: < 1s route load on 3G-fast (AC2) and initial JS < 200 KB gzipped (AC3) — favor server components and code-splitting.
- Testing standards: vitest (`pnpm test`), TS strict, test-first; include a bundle-budget assertion.

### Project Structure Notes
- `packages/ui` (`ParentShellLayout`), `apps/platform/app/(app)/layout.tsx`.
- Depends on X7 (`packages/ui` primitives) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
