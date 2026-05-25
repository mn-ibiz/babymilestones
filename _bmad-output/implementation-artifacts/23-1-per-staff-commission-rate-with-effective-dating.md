# Story 23.1: Per-staff commission rate with effective dating

Status: backlog

> Canonical ID: P3-E01-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S01.md

## Story

As admin, I want each stylist's commission percentage to be configurable and to support changes over time.

## Acceptance Criteria

1. `staff_commission_rates` table: staff_id, rate_percent (decimal), effective_from, effective_to (nullable), reason.
2. Admin CRUD; setting a new rate auto-closes the previous one.
3. Bookings join commission via `effective_from ≤ booking.created_at < effective_to`.
4. Audit on every rate change.
5. Decision refs: 6, 15.

## Tasks / Subtasks

- [ ] Task 1: Implement Per-staff commission rate with effective dating (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: `staff_commission_rates` table: staff_id, rate_percent (decimal), effective_from, effective_to (nullable), reason.
  - [ ] Satisfy AC#2: Admin CRUD; setting a new rate auto-closes the previous one.
  - [ ] Satisfy AC#3: Bookings join commission via `effective_from ≤ booking.created_at < effective_to`.
  - [ ] Satisfy AC#4: Audit on every rate change.
  - [ ] Satisfy AC#5: Decision refs: 6, 15.
  - [ ] Touch / create: `packages/catalog/staff.ts`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`packages/catalog/staff.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
