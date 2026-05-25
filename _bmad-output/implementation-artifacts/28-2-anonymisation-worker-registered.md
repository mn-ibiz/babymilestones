# Story 28.2: Anonymisation worker registered

Status: backlog

> Canonical ID: P3-E06-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S02.md

## Story

As the system, observation anonymisation (P2-E03-S05) runs reliably each night.

## Acceptance Criteria

1. Job registered, schedule `0 2 * * *` (02:00 daily).
2. Logs count of rows anonymised.

## Tasks / Subtasks

- [ ] Task 1: Implement Anonymisation worker registered (AC: #1, #2)
  - [ ] Satisfy AC#1: Job registered, schedule `0 2 * * *` (02:00 daily).
  - [ ] Satisfy AC#2: Logs count of rows anonymised.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E03-S05
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
