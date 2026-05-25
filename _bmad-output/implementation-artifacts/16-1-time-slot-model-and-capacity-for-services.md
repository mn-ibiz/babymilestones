# Story 16.1: Time-slot model and capacity for services

Status: backlog

> Canonical ID: P2-E01-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S01.md

## Story

As admin, I want to define when a service is available and how many children fit per slot.

## Acceptance Criteria

1. `service_schedules` table: service_id, day_of_week (0-6), start_time, end_time, slot_duration_minutes, capacity, is_active.
2. A schedule generates concrete `session_slots` for the next 60 days; regenerated nightly.
3. Each slot has computed `remaining_capacity` = `capacity − bookings_in_slot`.
4. Admin CRUD; changes don't retroactively touch booked slots, only future ones.
5. Audit on schedule changes.

## Tasks / Subtasks

- [ ] Task 1: Implement Time-slot model and capacity for services (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: `service_schedules` table: service_id, day_of_week (0-6), start_time, end_time, slot_duration_minutes, capacity, is_active.
  - [ ] Satisfy AC#2: A schedule generates concrete `session_slots` for the next 60 days; regenerated nightly.
  - [ ] Satisfy AC#3: Each slot has computed `remaining_capacity` = `capacity − bookings_in_slot`.
  - [ ] Satisfy AC#4: Admin CRUD; changes don't retroactively touch booked slots, only future ones.
  - [ ] Satisfy AC#5: Audit on schedule changes.
  - [ ] Touch / create: `apps/jobs`, `packages/catalog/schedules.ts`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Slot pre-materialisation simplifies booking queries; cron in `apps/jobs`. Files: `packages/catalog/schedules.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S01.md]
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
