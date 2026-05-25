# Story 27.1: Daily operations dashboard

Status: backlog

> Canonical ID: P3-E05-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S01.md

## Story

As admin / owner, I want one screen showing what's happening today across all units.

## Acceptance Criteria

1. Tiles: today's revenue (total + per-unit), bookings count, active sessions, outstanding balances total, top staff today.
2. All numbers click through to drill-down.
3. Auto-refresh every 60s.
4. Permission: `admin`, `super_admin`, `treasury` (read-only).

## Tasks / Subtasks

- [ ] Task 1: Implement Daily operations dashboard (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Tiles: today's revenue (total + per-unit), bookings count, active sessions, outstanding balances total, top staff today.
  - [ ] Satisfy AC#2: All numbers click through to drill-down.
  - [ ] Satisfy AC#3: Auto-refresh every 60s.
  - [ ] Satisfy AC#4: Permission: `admin`, `super_admin`, `treasury` (read-only).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Materialised view refreshed every minute.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E03 - P2 + P3 epics
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
