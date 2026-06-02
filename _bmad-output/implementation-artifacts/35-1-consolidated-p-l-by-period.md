# Story 35.1: Consolidated P&L by period

Status: review

> Canonical ID: P5-E05-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S01.md

## Story

As owner / accountant, I want a single consolidated P&L for the complex.

## Acceptance Criteria

1. Per-unit revenue, direct costs (GRN-based for shop), expenses (from expenses module), net.
2. Period comparison: this month vs last month, this year vs last year.
3. PDF + Excel exports.
4. Decision refs: Spec Module 8.

## Tasks / Subtasks

- [ ] Task 1: Implement Consolidated P&L by period (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Per-unit revenue, direct costs (GRN-based for shop), expenses (from expenses module), net.
  - [ ] Satisfy AC#2: Period comparison: this month vs last month, this year vs last year.
  - [ ] Satisfy AC#3: PDF + Excel exports.
  - [ ] Satisfy AC#4: Decision refs: Spec Module 8.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P3-E05 - P4-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E05-S01.md]
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
