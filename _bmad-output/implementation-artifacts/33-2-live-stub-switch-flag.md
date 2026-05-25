# Story 33.2: Live/stub switch flag

Status: backlog

> Canonical ID: P5-E03-S02 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S02.md

## Story

As admin, I want to flip the stub off when the sender ID is registered.

## Acceptance Criteria

1. Settings flag `sms.live_enabled`.
2. Off → `StubAdapter`; On → `LiveSmsAdapter`.
3. Audit on flag change.

## Tasks / Subtasks

- [ ] Task 1: Implement Live/stub switch flag (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Settings flag `sms.live_enabled`.
  - [ ] Satisfy AC#2: Off → `StubAdapter`; On → `LiveSmsAdapter`.
  - [ ] Satisfy AC#3: Audit on flag change.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E10-S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E03.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
