# Story 35.2: Cohort retention by signup month

Status: backlog

> Canonical ID: P5-E05-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S02.md

## Story

As marketing, I want to see how many parents from each signup month are still active.

## Acceptance Criteria

1. Cohort matrix: signup month × months since signup; cell = % still active.
2. "Active" definition configurable (default: at least 1 paid touchpoint in the last 30 days).

## Tasks / Subtasks

- [ ] Task 1: Implement Cohort retention by signup month (AC: #1, #2)
  - [ ] Satisfy AC#1: Cohort matrix: signup month × months since signup; cell = % still active.
  - [ ] Satisfy AC#2: "Active" definition configurable (default: at least 1 paid touchpoint in the last 30 days).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P3-E05.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
