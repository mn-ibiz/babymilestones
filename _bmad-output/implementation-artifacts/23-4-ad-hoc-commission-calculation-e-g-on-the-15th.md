# Story 23.4: Ad-hoc commission calculation (e.g., on the 15th)

Status: backlog

> Canonical ID: P3-E01-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S04.md

## Story

As admin, I want to run commission calculation any time, not only month-end.

## Acceptance Criteria

1. Admin Reports → "Run ad-hoc commission" → date-range picker → preview totals.
2. Confirming creates a `commission_runs` row marked `ad_hoc`.
3. Subsequent month-end run excludes already-paid-out ad-hoc periods.

## Tasks / Subtasks

- [x] Task 1: Implement Ad-hoc commission calculation (e.g., on the 15th) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Admin Reports → "Run ad-hoc commission" → date-range picker → preview totals. (`POST /admin/commission-runs/preview` + console page/lib)
  - [x] Satisfy AC#2: Confirming creates a `commission_runs` row marked `ad_hoc`. (`POST /admin/commission-runs`, `kind='ad_hoc'`, audited)
  - [x] Satisfy AC#3: Subsequent month-end run excludes already-paid-out ad-hoc periods. (ledger `run_id` claiming — a monthly run only nets UNCLAIMED entries)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C apps/api exec vitest run src/routes/admin/commission-runs.test.ts` — 6 passed
- `pnpm -C packages/catalog exec vitest run` — 151 passed (incl. previewCommissionRun)
- `pnpm -C apps/admin exec vitest run lib/commission-runs.test.ts` — 9 passed
- typecheck clean: catalog, api, admin

### Completion Notes List

- AC1 (preview): `previewCommissionRun` (catalog) computes the SAME net-per-staff aggregation over unclaimed entries as a real run, but persists nothing — so the preview matches a subsequent confirm. Exposed at `POST /admin/commission-runs/preview` (no write, not audited).
- AC2 (confirm): `POST /admin/commission-runs` creates a `kind='ad_hoc'` run via `createCommissionRun`, audited `commission.run.created`. Run management is admin-gated (`manage service`); listing/detail are gated `read report` (admin/accountant/treasury). `GET /admin/commission-runs` + `/:id` back the history + S05 export.
- AC3 (exclusion): re-uses S03's `commission_ledger.run_id` claiming — a run only sums UNCLAIMED entries and stamps them, so a later month-end run automatically excludes an already-run ad-hoc period. Verified end-to-end in the route test.
- Admin console: `app/commission-runs` page + `lib/commission-runs.ts` (date-range validation + integer-cents formatting).

### File List

- packages/catalog/src/commission-run.ts (+previewCommissionRun)
- packages/catalog/src/commission-run.test.ts (preview covered via run tests)
- packages/catalog/src/index.ts (export)
- apps/api/src/routes/admin/commission-runs.ts (new)
- apps/api/src/routes/admin/commission-runs.test.ts (new)
- apps/api/src/routes/admin/index.ts (wire)
- apps/admin/lib/commission-runs.ts (new)
- apps/admin/lib/commission-runs.test.ts (new)
- apps/admin/app/commission-runs/page.tsx (new)
- apps/admin/app/commission-runs/commission-runs-client.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Ad-hoc commission run (preview + confirm route, console), reuses run-id claiming for exclusion, TDD; all ACs met | Claude Opus 4.8 (1M context) |
