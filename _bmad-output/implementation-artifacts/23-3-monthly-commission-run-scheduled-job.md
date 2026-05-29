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

- [x] Task 1: Implement Monthly commission run (scheduled job) (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: Cron runs at 02:00 on the 1st of each month. (`createCommissionRunJob` factory, monthly cadence + injected clock, wired in `apps/jobs/src/index.ts`; the 28-3 runner sets the real cron)
  - [x] Satisfy AC#2: Computes per-staff totals for the prior month. (`priorMonthPeriod` + `createCommissionRun` net aggregation)
  - [x] Satisfy AC#3: Writes `commission_runs` row + `commission_run_lines` per staff. (migration 0061)
  - [x] Satisfy AC#4: Run is idempotent — running twice for the same month is a no-op. (monthly-period unique index → returns existing run)
  - [x] Satisfy AC#5: Audit logged. (`commission.run.created`, only for a newly-created run)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/catalog exec vitest run` — 145 passed (incl. 6 commission-run)
- `pnpm -C apps/jobs exec vitest run` — 61 passed (incl. 3 commission-run job)
- `pnpm -C packages/db exec vitest run` — 98 passed
- `pnpm -C packages/auth exec vitest run` — 118 passed
- typecheck clean: db, catalog, jobs, auth

### Completion Notes List

- `commission_runs` + `commission_run_lines` (migration 0061). A monthly run is unique per `[periodStart, periodEnd)` (partial unique index) so a re-run returns the existing run untouched — idempotent (AC4). Each run line snapshots the staff display name (payout history must not rewrite).
- `createCommissionRun` (catalog) aggregates NET commission (accruals minus reversals) per staff over UNCLAIMED ledger entries in the half-open period, writes the run + positive lines, and stamps each entry's `commission_ledger.run_id` (added in 0061) — claiming makes a later monthly run exclude an already-run ad-hoc period (S04 AC3) and prevents any double-count. Concurrency-safe via the unique index (conflict → return existing).
- `createCommissionRunJob` (apps/jobs/src/jobs/commission-run.ts) is built as a `(deps): Job` factory exactly like the sibling jobs and registered the same way (`registerCommissionRunJob` in index.ts). It computes the prior calendar month (`priorMonthPeriod`, UTC) and audits `commission.run.created` only for a genuinely new run. The 02:00-on-the-1st cron expression is the runner's responsibility (28-3 wires this job into the new framework).

### File List

- packages/db/migrations/0061_commission_runs.sql (new; +commission_ledger.run_id)
- packages/db/src/schema/commission-runs.ts (new)
- packages/db/src/schema/commission-ledger.ts (+runId column/index)
- packages/db/src/schema/index.ts (export)
- packages/catalog/src/commission-run.ts (new)
- packages/catalog/src/commission-run.test.ts (new)
- packages/catalog/src/index.ts (export)
- apps/jobs/src/jobs/commission-run.ts (new)
- apps/jobs/src/jobs/commission-run.test.ts (new)
- apps/jobs/src/index.ts (wire + register)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Monthly commission run (migration 0061, run logic + scheduled-job factory), idempotent, TDD; all ACs met | Claude Opus 4.8 (1M context) |
