# Story 27.2: Revenue by unit by period

Status: backlog

> Canonical ID: P3-E05-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S02.md

## Story

As owner, I want to see revenue trends per business unit.

## Acceptance Criteria

1. Date-range picker; per-unit revenue line/bar chart; period-over-period delta.
2. CSV export per the same filter.
3. Excludes refunded amounts.

## Tasks / Subtasks

- [ ] Task 1: Implement Revenue by unit by period (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Date-range picker; per-unit revenue line/bar chart; period-over-period delta.
  - [ ] Satisfy AC#2: CSV export per the same filter.
  - [ ] Satisfy AC#3: Excludes refunded amounts.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
