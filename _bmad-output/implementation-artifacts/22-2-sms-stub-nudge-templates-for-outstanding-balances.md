# Story 22.2: SMS-stub nudge templates for outstanding balances

Status: backlog

> Canonical ID: P2-E07-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S02.md

## Story

As the system, I want to remind parents about their outstanding balance on a schedule.

## Acceptance Criteria

1. New templates registered: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`.
2. Job in `apps/jobs/dunning/outstanding-reminders.ts` runs daily, queues stub-SMS per the schedule.
3. Parent opt-out from non-transactional reminders honoured (consent flag).

## Tasks / Subtasks

- [ ] Task 1: Implement SMS-stub nudge templates for outstanding balances (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: New templates registered: `outstanding.day1`, `outstanding.day7`, `outstanding.day30`.
  - [ ] Satisfy AC#2: Job in `apps/jobs/dunning/outstanding-reminders.ts` runs daily, queues stub-SMS per the schedule.
  - [ ] Satisfy AC#3: Parent opt-out from non-transactional reminders honoured (consent flag).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E09 - S01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
