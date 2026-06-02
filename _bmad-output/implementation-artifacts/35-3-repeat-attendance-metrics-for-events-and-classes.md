# Story 35.3: Repeat-attendance metrics for events and classes

Status: review

> Canonical ID: P5-E05-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S03.md

## Story

As admin, I want to know which classes keep parents coming back.

## Acceptance Criteria

1. Per-class table: total attendees, % who attended another class, average classes attended.
2. Filterable by date.

## Tasks / Subtasks

- [ ] Task 1: Implement Repeat-attendance metrics for events and classes (AC: #1, #2)
  - [ ] Satisfy AC#1: Per-class table: total attendees, % who attended another class, average classes attended.
  - [ ] Satisfy AC#2: Filterable by date.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P4-E05 - P5-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S03.md]
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
