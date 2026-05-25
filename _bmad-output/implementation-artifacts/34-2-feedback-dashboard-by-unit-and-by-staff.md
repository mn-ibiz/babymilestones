# Story 34.2: Feedback dashboard by unit and by staff

Status: backlog

> Canonical ID: P5-E04-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S02.md

## Story

As admin, I want to see who and what is delighting (or disappointing) parents.

## Acceptance Criteria

1. Unit-level averages, distributions; staff-level averages with min-sample-size guardrail (avoid one-star surprises).
2. Filterable by date range.
3. Click → individual responses (anonymised view by default; admin can de-anonymise with audit).

## Tasks / Subtasks

- [ ] Task 1: Implement Feedback dashboard by unit and by staff (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Unit-level averages, distributions; staff-level averages with min-sample-size guardrail (avoid one-star surprises).
  - [ ] Satisfy AC#2: Filterable by date range.
  - [ ] Satisfy AC#3: Click → individual responses (anonymised view by default; admin can de-anonymise with audit).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E04-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
