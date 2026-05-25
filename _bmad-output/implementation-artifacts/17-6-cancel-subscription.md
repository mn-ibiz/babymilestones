# Story 17.6: Cancel subscription

Status: backlog

> Canonical ID: P2-E02-S06 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S06.md

## Story

As parent,
I want to cancel my subscription and not be charged again,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cancel from parent dashboard; effective at `current_period_end` (current period plays out).
2. Cancellation reversible until period end.
3. No refunds on already-paid periods (refunds handled offline per spec).

## Tasks / Subtasks

- [ ] Task 1: Implement Cancel subscription (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Cancel from parent dashboard; effective at `current_period_end` (current period plays out).
  - [ ] Satisfy AC#2: Cancellation reversible until period end.
  - [ ] Satisfy AC#3: No refunds on already-paid periods (refunds handled offline per spec).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
