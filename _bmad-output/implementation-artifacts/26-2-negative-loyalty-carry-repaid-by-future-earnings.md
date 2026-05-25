# Story 26.2: Negative-loyalty carry repaid by future earnings

Status: backlog

> Canonical ID: P3-E04-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S02.md

## Story

As the system, future loyalty earnings should first repay any negative balance before adding to spendable points.

## Acceptance Criteria

1. When a new earn entry posts, if balance is negative, apply earned points to bring balance back up to 0 first; remainder is spendable.
2. The earn ledger row tags `applied_to_negative_carry` portion separately for traceability.

## Tasks / Subtasks

- [ ] Task 1: Implement Negative-loyalty carry repaid by future earnings (AC: #1, #2)
  - [ ] Satisfy AC#1: When a new earn entry posts, if balance is negative, apply earned points to bring balance back up to 0 first; remainder is spendable.
  - [ ] Satisfy AC#2: The earn ledger row tags `applied_to_negative_carry` portion separately for traceability.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S02.md]
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
