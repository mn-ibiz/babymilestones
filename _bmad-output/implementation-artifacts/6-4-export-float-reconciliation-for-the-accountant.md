# Story 6.4: Export float reconciliation for the accountant

Status: ready-for-dev

> Canonical ID: P1-E06-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S04.md

## Story

As the accountant,
I want a CSV of daily liability vs float,
so that I can reconcile in Excel.

## Acceptance Criteria

1. Date-range picker; export as CSV.
2. Columns: date, account, system balance, real balance, drift, adjustments made that day.

## Tasks / Subtasks

- [ ] Task 1: Export contract (AC: #1)
  - [ ] Add reconciliation-export Zod schema in `packages/contracts` (from_date, to_date)
- [ ] Task 2: CSV export route (AC: #1, #2)
  - [ ] `apps/api/src/routes/treasury/reconciliation-export.ts` — for the date range, per day per float account emit rows: date, account, system balance, real balance, drift, adjustments made that day; stream as `text/csv`
  - [ ] Reuse the reconciliation read model from P1-E06-S02; guard access via `@bm/auth` (admin/treasury/super_admin); write `audit_outbox` on export
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
- [ ] Task 3: Export UI (AC: #1)
  - [ ] `apps/admin` Treasury — date-range picker + "Export CSV" button that downloads the file
- [ ] Task 4: Tests per source "Tests" section (AC: all)
  - [ ] Unit: CSV row/column shaping incl. per-day adjustments aggregation (vitest, test-first)
  - [ ] Integration: export route returns correct CSV for a range; access guarded + audited
  - [ ] E2E: pick range, download CSV with expected columns

## Dev Notes

- Reuse the reconciliation read model (liability grouped by `float_account_id`, drift = system − real) from P1-E06-S02 rather than recomputing — the export is a CSV projection of the same data plus that day's adjustments.
- Stream CSV with the exact columns: date, account, system balance, real balance, drift, adjustments made that day.
- Guard with the treasury access roles from P1-E06-S03; audit the export action.
- Source paths to touch: `apps/api/src/routes/treasury/reconciliation-export.ts`, `apps/admin` Treasury export UI, `packages/contracts` (export schema), `@bm/auth` (access guard), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Export route in `apps/api/src/routes/treasury/`; UI in `apps/admin`; data via the P1-E06-S02 read model in `packages/db`/`@bm/wallet`.
- Dependency (from source): S02 (reconciliation read model + adjustments). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
