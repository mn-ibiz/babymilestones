# Story 25.5: Salon-specific reporting tile

Status: backlog

> Canonical ID: P3-E03-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S05.md

## Story

As admin, I want salon performance at a glance.

## Acceptance Criteria

1. Tile on operational dashboard: today's bookings, no-shows, total revenue.
2. Drill-down to per-stylist breakdown.

## Tasks / Subtasks

- [ ] Task 1: Implement Salon-specific reporting tile (AC: #1, #2)
  - [ ] Satisfy AC#1: Tile on operational dashboard: today's bookings, no-shows, total revenue.
  - [ ] Satisfy AC#2: Drill-down to per-stylist breakdown.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P3-E05. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
