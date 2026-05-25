# Story 23.3: Monthly commission run (scheduled job)

Status: backlog

> Canonical ID: P3-E01-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S03.md

## Story

As the system, I want to close each calendar month's commission and produce a payout report.

## Acceptance Criteria

1. Cron in `apps/jobs/commission/run.ts` runs at 02:00 on the 1st of each month.
2. Computes per-staff totals for the prior month.
3. Writes `commission_runs` row + `commission_run_lines` per staff.
4. Run is idempotent — running twice for the same month is a no-op.
5. Audit logged.

## Tasks / Subtasks

- [ ] Task 1: Implement Monthly commission run (scheduled job) (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: Cron in `apps/jobs/commission/run.ts` runs at 02:00 on the 1st of each month.
  - [ ] Satisfy AC#2: Computes per-staff totals for the prior month.
  - [ ] Satisfy AC#3: Writes `commission_runs` row + `commission_run_lines` per staff.
  - [ ] Satisfy AC#4: Run is idempotent — running twice for the same month is a no-op.
  - [ ] Satisfy AC#5: Audit logged.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Decision 15.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S02.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S03.md]
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
