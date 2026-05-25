# Story 28.5: M-Pesa STK reconciliation cron now under framework

Status: backlog

> Canonical ID: P3-E06-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S05.md

## Story

Move the P1 ad-hoc STK reconciliation into the framework.

## Acceptance Criteria

1. P1-E04-S03 logic registered as `payments.mpesa.reconcile` every 60s.
2. Logs count of recovered transactions per run.

## Tasks / Subtasks

- [ ] Task 1: Implement M-Pesa STK reconciliation cron now under framework (AC: #1, #2)
  - [ ] Satisfy AC#1: P1-E04-S03 logic registered as `payments.mpesa.reconcile` every 60s.
  - [ ] Satisfy AC#2: Logs count of recovered transactions per run.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E04-S03. --- *End of P3 stories.*
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
