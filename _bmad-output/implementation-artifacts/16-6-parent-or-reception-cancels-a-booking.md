# Story 16.6: Parent or Reception cancels a booking

Status: backlog

> Canonical ID: P2-E01-S06 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S06.md

## Story

As parent,
I want to cancel a booking I no longer need,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cancel before cut-off → slot capacity restored, invoice voided.
2. Cancel after cut-off → admin discretion (reception flow); cancellation fee policy configurable per service (zero by default).
3. Audit logged.

## Tasks / Subtasks

- [ ] Task 1: Implement Parent or Reception cancels a booking (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Cancel before cut-off → slot capacity restored, invoice voided.
  - [ ] Satisfy AC#2: Cancel after cut-off → admin discretion (reception flow); cancellation fee policy configurable per service (zero by default).
  - [ ] Satisfy AC#3: Audit logged.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
