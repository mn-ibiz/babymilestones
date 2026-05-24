# Story 12.3: Deep-link from WhatsApp ads

Status: ready-for-dev

> Canonical ID: P1-E12-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S03.md

## Story

As a marketing manager,
I want to link from a WhatsApp ad straight to the right booking flow,
so that ad traffic lands on the correct unit and we can attribute signups.

## Acceptance Criteria

1. URL pattern `/book/[unit]?utm_*` captures UTM and pre-selects the unit.
2. UTM persisted to parent on signup for attribution.

## Tasks / Subtasks

- [ ] Task 1: Deep-link route in `apps/platform` public route group (AC: #1)
  - [ ] Add dynamic route `apps/platform/app/(public)/book/[unit]/page.tsx` that pre-selects the unit and captures `utm_*` query params
  - [ ] Carry captured UTM through to the signup flow (e.g. via cookie/session/query) so it survives to account creation
- [ ] Task 2: Persist UTM on signup in `apps/api` (AC: #2)
  - [ ] On parent signup, write captured `utm_*` to `parents.acquisition_source` (per source Technical Notes) — additive column/usage in `packages/db`
  - [ ] Validate/normalize UTM payload via `@bm/contracts`
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: `/book/[unit]?utm_*` pre-selects the unit and captures UTM; UTM survives to signup and is persisted to `parents.acquisition_source`. Use vitest, test-first.

## Dev Notes

- Deep-link route in `apps/platform` public route group (`apps/platform/app/(public)/book/[unit]/`). Signup persistence handled in `apps/api`, writing to `parents.acquisition_source` (per source Technical Notes).
- Builds on per-unit pages (S02) and parent signup (P1-E02). Any `parents` column work in `packages/db` must be additive-only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/platform/app/(public)/book/[unit]/`, signup persistence in `apps/api`, `parents.acquisition_source` in `packages/db`.
- Depends on S02 (per-unit pages) and P1-E02 (parent signup) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S03.md]
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
