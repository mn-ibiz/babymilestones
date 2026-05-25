# Story 23.5: Commission payout export (CSV)

Status: backlog

> Canonical ID: P3-E01-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S05.md

## Story

As accountant, I want to download the commission run as CSV to feed into M-Pesa B2C.

## Acceptance Criteria

1. Per run: CSV with staff name, phone (held on staff record), amount, reference.
2. Audit on export download.
3. Mark run as `paid_out_at` after admin confirms payout has been made externally.

## Tasks / Subtasks

- [ ] Task 1: Implement Commission payout export (CSV) (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Per run: CSV with staff name, phone (held on staff record), amount, reference.
  - [ ] Satisfy AC#2: Audit on export download.
  - [ ] Satisfy AC#3: Mark run as `paid_out_at` after admin confirms payout has been made externally.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S03 - S04. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
