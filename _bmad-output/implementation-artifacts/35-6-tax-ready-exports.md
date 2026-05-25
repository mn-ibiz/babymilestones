# Story 35.6: Tax-ready exports

Status: backlog

> Canonical ID: P5-E05-S06 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S06.md

## Story

As accountant, I want VAT-formatted exports once eTIMS is live.

## Acceptance Criteria

1. Per-period: total taxable supplies, VAT charged, exempt supplies.
2. PDF + Excel.

## Tasks / Subtasks

- [ ] Task 1: Implement Tax-ready exports (AC: #1, #2)
  - [ ] Satisfy AC#1: Per-period: total taxable supplies, VAT charged, exempt supplies.
  - [ ] Satisfy AC#2: PDF + Excel.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P5-E02. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S06.md]
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
