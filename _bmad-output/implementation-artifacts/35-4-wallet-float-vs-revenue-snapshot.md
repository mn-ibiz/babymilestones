# Story 35.4: Wallet float vs revenue snapshot

Status: done

> Canonical ID: P5-E05-S04 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S04.md

## Story

As accountant, I want a daily report on how much customer money is sitting in wallets vs revenue earned.

## Acceptance Criteria

1. Daily snapshot: `customer_wallet_liability` total, segregated-account balance, prior-day delta, revenue earned that day.
2. 90-day chart of float vs revenue.

## Tasks / Subtasks

- [ ] Task 1: Implement Wallet float vs revenue snapshot (AC: #1, #2)
  - [ ] Satisfy AC#1: Daily snapshot: `customer_wallet_liability` total, segregated-account balance, prior-day delta, revenue earned that day.
  - [ ] Satisfy AC#2: 90-day chart of float vs revenue.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E06 - P3-E05
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
