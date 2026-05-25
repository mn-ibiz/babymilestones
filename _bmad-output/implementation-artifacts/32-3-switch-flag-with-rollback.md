# Story 32.3: Switch flag with rollback

Status: backlog

> Canonical ID: P5-E02-S03 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S03.md

## Story

As admin, I want to enable/disable eTIMS without code deploy.

## Acceptance Criteria

1. Settings flag `receipts.etims_enabled`.
2. Off → `LocalReceiptWriter` (P1); On → `EtimsReceiptWriter`.
3. Audit on flag change.
4. New receipts only — historical ones not retroactively re-issued.

## Tasks / Subtasks

- [ ] Task 1: Implement Switch flag with rollback (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: Settings flag `receipts.etims_enabled`.
  - [ ] Satisfy AC#2: Off → `LocalReceiptWriter` (P1); On → `EtimsReceiptWriter`.
  - [ ] Satisfy AC#3: Audit on flag change.
  - [ ] Satisfy AC#4: New receipts only — historical ones not retroactively re-issued.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E10-S04
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E02-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E02.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
