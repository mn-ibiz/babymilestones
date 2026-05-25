# Story 20.2: Configurable earn and redeem rates

Status: backlog

> Canonical ID: P2-E05-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S02.md

## Story

As admin, I want to tune the loyalty programme without code changes.

## Acceptance Criteria

1. Settings: `earn_rate` (KES per point, default 100), `redeem_rate` (KES per point, default 1).
2. Changes are effective-dated; historical earnings/redemptions unchanged.
3. Decision refs: 11, 34.

## Tasks / Subtasks

- [ ] Task 1: Implement Configurable earn and redeem rates (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Settings: `earn_rate` (KES per point, default 100), `redeem_rate` (KES per point, default 1).
  - [ ] Satisfy AC#2: Changes are effective-dated; historical earnings/redemptions unchanged.
  - [ ] Satisfy AC#3: Decision refs: 11, 34.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E10-S04.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
