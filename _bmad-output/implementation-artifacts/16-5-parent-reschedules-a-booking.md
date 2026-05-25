# Story 16.5: Parent reschedules a booking

Status: ready-for-dev

> Canonical ID: P2-E01-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S05.md

## Story

As parent,
I want to move a booking if life gets in the way, up to the cut-off,
so that the capability described above is delivered.

## Acceptance Criteria

1. Reschedule allowed up to N hours before slot (configurable per service; default 2).
2. New slot must have capacity; new booking replaces old in one transaction.
3. Audit shows both old and new slot IDs.
4. After cut-off, parent gets a clear "Contact reception" message instead.

## Tasks / Subtasks

- [ ] Task 1: Implement Parent reschedules a booking (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Reschedule allowed up to N hours before slot (configurable per service; default 2).
  - [ ] Satisfy AC#2: New slot must have capacity; new booking replaces old in one transaction.
  - [ ] Satisfy AC#3: Audit shows both old and new slot IDs.
  - [ ] Satisfy AC#4: After cut-off, parent gets a clear "Contact reception" message instead.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S05.md]
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
