# Story 18.2: Attendant check-in screen

Status: backlog

> Canonical ID: P2-E03-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S02.md

## Story

As attendant (operated via Reception's screen),
I want to check children in for a session in seconds,
so that the capability described above is delivered.

## Acceptance Criteria

1. Today's session slots listed; tap → booking list for that slot.
2. For each booking: child card with name + photo (if consented) + drop-off time field.
3. Check-in triggers wallet debit (P1-E03-S05) and records `attendance.checked_in_at`.
4. Bulk check-in supported (rare but useful).

## Tasks / Subtasks

- [ ] Task 1: Implement Attendant check-in screen (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Today's session slots listed; tap → booking list for that slot.
  - [ ] Satisfy AC#2: For each booking: child card with name + photo (if consented) + drop-off time field.
  - [ ] Satisfy AC#3: Check-in triggers wallet debit (P1-E03-S05) and records `attendance.checked_in_at`.
  - [ ] Satisfy AC#4: Bulk check-in supported (rare but useful).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Reception screen sub-route. Same auth as Reception.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E01 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
