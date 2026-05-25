# Story 16.7: Bookings list on parent dashboard

Status: backlog

> Canonical ID: P2-E01-S07 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S07.md

## Story

As parent,
I want to see what I've booked, what's coming up, and what's done,
so that the capability described above is delivered.

## Acceptance Criteria

1. Upcoming, today, past tabs; per-row: service, child, date, status, attendance.
2. Tap → detail with reschedule/cancel CTAs subject to AC of S05/S06.

## Tasks / Subtasks

- [ ] Task 1: Implement Bookings list on parent dashboard (AC: #1, #2)
  - [ ] Satisfy AC#1: Upcoming, today, past tabs; per-row: service, child, date, status, attendance.
  - [ ] Satisfy AC#2: Tap → detail with reschedule/cancel CTAs subject to AC of S05/S06.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S07.md]
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
