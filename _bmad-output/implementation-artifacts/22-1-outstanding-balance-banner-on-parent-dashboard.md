# Story 22.1: Outstanding-balance banner on parent dashboard

Status: backlog

> Canonical ID: P2-E07-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S01.md

## Story

As parent with an outstanding balance,
I want it surfaced clearly,
so that I don't forget.

## Acceptance Criteria

1. If `outstanding_amount > 0`, banner shows on every page: "You owe KES X. Top up to settle."
2. Banner CTA opens top-up flow.
3. After settlement, banner disappears automatically.

## Tasks / Subtasks

- [ ] Task 1: Implement Outstanding-balance banner on parent dashboard (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: If `outstanding_amount > 0`, banner shows on every page: "You owe KES X. Top up to settle."
  - [ ] Satisfy AC#2: Banner CTA opens top-up flow.
  - [ ] Satisfy AC#3: After settlement, banner disappears automatically.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Banner uses `OutstandingBalanceBanner` compound.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E11 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E07-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E07.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
