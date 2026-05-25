# Story 30.1: Event creation

Status: backlog

> Canonical ID: P4-E05-S01 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S01.md

## Story

As admin, I want to create an event with capacity, date, location, and pricing tiers.

## Acceptance Criteria

1. `events` table: name, description, unit (`reading_corner` | `talent_recital` | `general`), starts_at, ends_at, venue, capacity.
2. `event_ticket_tiers` table: event_id, name, price_cents, allotment, sale_starts_at, sale_ends_at.
3. Admin CRUD with audit.
4. Decision refs: 28.

## Tasks / Subtasks

- [ ] Task 1: Implement Event creation (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: `events` table: name, description, unit (`reading_corner` | `talent_recital` | `general`), starts_at, ends_at, venue, capacity.
  - [ ] Satisfy AC#2: `event_ticket_tiers` table: event_id, name, price_cents, allotment, sale_starts_at, sale_ends_at.
  - [ ] Satisfy AC#3: Admin CRUD with audit.
  - [ ] Satisfy AC#4: Decision refs: 28.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E10.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
