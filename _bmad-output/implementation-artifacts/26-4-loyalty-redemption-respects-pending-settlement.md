# Story 26.4: Loyalty redemption respects pending settlement

Status: backlog

> Canonical ID: P3-E04-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S04.md

## Story

As the system, I must not let parents redeem points that are about to be clawed back.

## Acceptance Criteria

1. At redemption, `available_to_redeem = balance − points_pending_clawback`.
2. Pending clawback set when a refund is initiated but not yet finalised (rare; admin workflow).
3. UI shows available-to-redeem, not raw balance, on the redeem screen.

## Tasks / Subtasks

- [ ] Task 1: Implement Loyalty redemption respects pending settlement (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: At redemption, `available_to_redeem = balance − points_pending_clawback`.
  - [ ] Satisfy AC#2: Pending clawback set when a refund is initiated but not yet finalised (rare; admin workflow).
  - [ ] Satisfy AC#3: UI shows available-to-redeem, not raw balance, on the redeem screen.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E05-S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
