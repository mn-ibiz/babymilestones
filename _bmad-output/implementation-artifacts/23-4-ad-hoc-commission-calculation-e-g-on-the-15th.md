# Story 23.4: Ad-hoc commission calculation (e.g., on the 15th)

Status: backlog

> Canonical ID: P3-E01-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S04.md

## Story

As admin, I want to run commission calculation any time, not only month-end.

## Acceptance Criteria

1. Admin Reports → "Run ad-hoc commission" → date-range picker → preview totals.
2. Confirming creates a `commission_runs` row marked `ad_hoc`.
3. Subsequent month-end run excludes already-paid-out ad-hoc periods.

## Tasks / Subtasks

- [ ] Task 1: Implement Ad-hoc commission calculation (e.g., on the 15th) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Admin Reports → "Run ad-hoc commission" → date-range picker → preview totals.
  - [ ] Satisfy AC#2: Confirming creates a `commission_runs` row marked `ad_hoc`.
  - [ ] Satisfy AC#3: Subsequent month-end run excludes already-paid-out ad-hoc periods.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
