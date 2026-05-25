# Story 32.2: eTIMS retry + dead-letter

Status: backlog

> Canonical ID: P5-E02-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S02.md

## Story

As the system, if KRA is down, I shouldn't lose the receipt.

## Acceptance Criteria

1. Failures queued to `kra_etims_queue` for retry by the jobs runner.
2. Exponential backoff up to 24h; alert if dead-lettered.
3. Admin can manually retry / inspect failures from Settings.

## Tasks / Subtasks

- [ ] Task 1: Implement eTIMS retry + dead-letter (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Failures queued to `kra_etims_queue` for retry by the jobs runner.
  - [ ] Satisfy AC#2: Exponential backoff up to 24h; alert if dead-lettered.
  - [ ] Satisfy AC#3: Admin can manually retry / inspect failures from Settings.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P3-E06
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
