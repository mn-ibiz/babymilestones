# Story 31.3: Group session booking

Status: review

> Canonical ID: P5-E01-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S03.md

## Story

As parent,
I want to attend a group session (e.g., "Newborn Care, Saturday") with other parents,
so that the capability described above is delivered.

## Acceptance Criteria

1. Group sessions defined as slots with capacity > 1.
2. Parents book individual seats; bookings list shows seats remaining.
3. Same payment and reminder flows as 1:1.

## Tasks / Subtasks

- [ ] Task 1: Implement Group session booking (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Group sessions defined as slots with capacity > 1.
  - [ ] Satisfy AC#2: Parents book individual seats; bookings list shows seats remaining.
  - [ ] Satisfy AC#3: Same payment and reminder flows as 1:1.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - S02
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
