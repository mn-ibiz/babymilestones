# Story 21.1: Settings for backup retention policy

Status: backlog

> Canonical ID: P2-E06-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S01.md

## Story

As admin, I want to choose how many daily / monthly backups to keep.

## Acceptance Criteria

1. Settings: `daily_retention_days` (default 30), `monthly_retention_months` (default 12).
2. Admin-editable; audit logged.
3. Decision 35 unlocked here (P1 ships fixed 30-day).

## Tasks / Subtasks

- [ ] Task 1: Implement Settings for backup retention policy (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Settings: `daily_retention_days` (default 30), `monthly_retention_months` (default 12).
  - [ ] Satisfy AC#2: Admin-editable; audit logged.
  - [ ] Satisfy AC#3: Decision 35 unlocked here (P1 ships fixed 30-day).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E10.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
