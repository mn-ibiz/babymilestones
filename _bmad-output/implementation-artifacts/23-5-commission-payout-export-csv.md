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

- [x] Task 1: Implement Commission payout export (CSV) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Per run: CSV with staff name, phone (held on staff record), amount, reference. (`buildPayoutCsv` + `GET /admin/commission-runs/:id/export.csv`; staff phone added in migration 0062)
  - [x] Satisfy AC#2: Audit on export download. (`commission.run.export` on the CSV download)
  - [x] Satisfy AC#3: Mark run as `paid_out_at` after admin confirms payout. (`POST /admin/commission-runs/:id/mark-paid`, idempotent, audited `commission.run.paid_out`)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/catalog exec vitest run` — 156 passed (incl. 5 payout-csv)
- `pnpm -C apps/api exec vitest run` — 461 passed (incl. commission-export route suite)
- `pnpm -C apps/admin exec vitest run` — 30 passed
- typecheck clean: db, catalog, api, admin

### Completion Notes List

- AC1: `buildPayoutCsv` (catalog) renders RFC-4180 CSV `staff_name,phone,amount,reference` — integer-cents amounts as a decimal, blank phone field when none on file (line still emitted). `GET /admin/commission-runs/:id/export.csv` resolves the staff phone (migration 0062 added `staff.phone`) per run line, uses the line's name snapshot (payout history must not rewrite), and a `COMM-<run>-<staff>` reference. Served `text/csv` with a content-disposition attachment.
- AC2: every CSV download writes a `commission.run.export` audit row.
- AC3: `POST /admin/commission-runs/:id/mark-paid` stamps `paid_out_at` (idempotent — a second mark is a 200 no-op that does not re-audit), audited `commission.run.paid_out`. Admin-gated (`manage service`); export is gated `read report` (admin/accountant/treasury).
- Reused the established CSV pattern (RFC-4180 escaping + `text/csv` attachment, mirroring `@bm/wallet` statement export) rather than a new mechanism. Admin console: export-URL + can-mark-paid helpers in `lib/commission-runs.ts`.

### File List

- packages/db/migrations/0062_staff_phone.sql (new)
- packages/db/src/schema/staff.ts (+phone)
- packages/catalog/src/commission-run.ts (+buildPayoutCsv / PayoutRow)
- packages/catalog/src/payout-csv.test.ts (new)
- packages/catalog/src/index.ts (export)
- apps/api/src/routes/admin/commission-runs.ts (+export.csv + mark-paid)
- apps/api/src/routes/admin/commission-export.test.ts (new)
- apps/admin/lib/commission-runs.ts (+payoutCsvUrl / canMarkPaid)
- apps/admin/lib/commission-runs.test.ts (+coverage)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Payout CSV export + mark-paid (migration 0062 staff.phone), audited, TDD; all ACs met | Claude Opus 4.8 (1M context) |
