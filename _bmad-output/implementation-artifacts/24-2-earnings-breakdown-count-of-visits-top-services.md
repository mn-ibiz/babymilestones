# Story 24.2: Earnings breakdown (count of visits, top services)

Status: backlog

> Canonical ID: P3-E02-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S02.md

## Story

As stylist,
I want to know which services drove my earnings,
so that the capability described above is delivered.

## Acceptance Criteria

1. Below total: number of completed visits, top 3 services by count, top 3 by revenue.
2. No customer-specific information shown.

## Tasks / Subtasks

- [ ] Task 1: Implement Earnings breakdown (count of visits, top services) (AC: #1, #2)
  - [ ] Satisfy AC#1: Below total: number of completed visits, top 3 services by count, top 3 by revenue.
  - [ ] Satisfy AC#2: No customer-specific information shown.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
