# Story 28.4: SMS retry worker registered

Status: backlog

> Canonical ID: P3-E06-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S04.md

## Story

Failed SMS sends from `sms_outbox` are retried automatically.

## Acceptance Criteria

1. Job picks `sms_outbox` rows where status=`failed` and attempt_count < 5.
2. Exponential backoff (1m, 5m, 30m, 2h, 12h).
3. After 5 failed attempts → dead-lettered + alert.

## Tasks / Subtasks

- [ ] Task 1: Implement SMS retry worker registered (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Job picks `sms_outbox` rows where status=`failed` and attempt_count < 5.
  - [ ] Satisfy AC#2: Exponential backoff (1m, 5m, 30m, 2h, 12h).
  - [ ] Satisfy AC#3: After 5 failed attempts → dead-lettered + alert.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E09
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S04.md]
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
