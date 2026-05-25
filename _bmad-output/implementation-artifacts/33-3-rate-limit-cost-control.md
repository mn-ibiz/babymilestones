# Story 33.3: Rate limit + cost control

Status: backlog

> Canonical ID: P5-E03-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S03.md

## Story

As admin, I want a guardrail against runaway SMS spend.

## Acceptance Criteria

1. Per-day total cap (default 10,000) and per-recipient daily cap (default 10).
2. Exceeding caps queues the message for next day and alerts admin.
3. Admin can adjust caps in Settings.

## Tasks / Subtasks

- [ ] Task 1: Implement Rate limit + cost control (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Per-day total cap (default 10,000) and per-recipient daily cap (default 10).
  - [ ] Satisfy AC#2: Exceeding caps queues the message for next day and alerts admin.
  - [ ] Satisfy AC#3: Admin can adjust caps in Settings.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E03-S03.md]
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
