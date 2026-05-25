# Story 6.4: Export float reconciliation for the accountant

Status: done

> Canonical ID: P1-E06-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S04.md

## Story

As the accountant,
I want a CSV of daily liability vs float,
so that I can reconcile in Excel.

## Acceptance Criteria

1. Date-range picker; export as CSV.
2. Columns: date, account, system balance, real balance, drift, adjustments made that day.

## Tasks / Subtasks

- [x] Task 1: Export contract (AC: #1)
  - [x] Add reconciliation-export Zod schema in `packages/contracts` (fromDate, toDate) + day enumeration, KES formatting, and RFC-4180 CSV rendering helpers
- [x] Task 2: CSV export route (AC: #1, #2)
  - [x] `apps/api/src/routes/treasury/reconciliation-export.ts` — for the date range, per day per float account emit rows: date, account, system balance, real balance, drift, adjustments made that day; streamed as `text/csv` (attachment)
  - [x] Reuse the P1-E06-S02 reconciliation read model (new `reconciliationExportRows` in `@bm/wallet`, layered on the same ledger-derived float liability + approved-adjustment model); guard access via `@bm/auth` (treasury/accountant/admin/super_admin); write `audit_outbox` on export
  - [x] Registered route via `registerTreasuryRoutes` (already wired into `buildApp`)
- [x] Task 3: Export UI (AC: #1)
  - [x] `apps/admin` Treasury `reconciliation/export` page — date-range picker + "Export CSV" button that downloads the file; framework-agnostic form logic in `apps/admin/lib/reconciliation-export.ts`
- [x] Task 4: Tests per source "Tests" section (AC: all)
  - [x] Unit: CSV row/column shaping incl. per-day adjustments aggregation (vitest, test-first) — contracts + wallet read model + admin form lib
  - [x] Integration: export route returns correct CSV for a range; access guarded + audited (`app.inject`)
  - [~] E2E (Playwright): deferred — covered by the integration test (CSV columns + download headers asserted via `app.inject`); repo has no running E2E harness wired for this surface yet

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

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test` (all workspaces, 265 API + package suites), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- **Read model** added as `reconciliationExportRows` in `@bm/wallet` (new `reconciliation-export.ts`). For each calendar day in the inclusive range and each float account (active + inactive, opening order) it computes the as-of-day system balance (opening + SUM of tagged ledger movements with `created_at` ≤ end-of-day), the net **approved** adjustments dated that day, the real balance (system + cumulative approved adjustments through the day), and drift = system − real. Pre-window movements/adjustments are carried into the first day. Pending/rejected adjustments are excluded.
- **Real-balance semantics:** no real-world balance is persisted (the live P1-E06-S02 screen takes it as manual input), so for a historical export the real figure is reconstructed from approved corrections — the only sound projection. Documented inline.
- **Contract** (`@bm/contracts`): `reconciliationExportQuerySchema` (validated calendar dates, `fromDate ≤ toDate`, ≤ 366-day cap), `reconciliationExportDays`/`DayCount`, `centsToKes` (exact, no float), and `reconciliationRowsToCsv` (RFC-4180: CRLF, quoting). Columns: `date, account, system_balance_kes, real_balance_kes, drift_kes, adjustments_kes`.
- **Route** `GET /treasury/reconciliation/export?fromDate&toDate` streams `text/csv` as an attachment, guarded to treasury/accountant/admin/super_admin (accountant via its `read reconciliation` grant — same rule the live screen uses), and writes `treasury.reconciliation.export` to `audit_outbox`.
- **UI**: `apps/admin/app/treasury/reconciliation/export/page.tsx` (date-range picker + Export CSV download) with framework-agnostic, unit-tested form logic in `apps/admin/lib/reconciliation-export.ts`.
- No migration required — read-only over existing `float_accounts` / `wallet_ledger` / `reconciliation_adjustments` tables (additive constraint satisfied trivially).

### File List

- `packages/contracts/src/index.ts` (export schema + helpers)
- `packages/contracts/src/index.test.ts`
- `packages/wallet/src/reconciliation-export.ts` (new)
- `packages/wallet/src/reconciliation-export.test.ts` (new)
- `packages/wallet/src/index.ts` (re-export)
- `apps/api/src/routes/treasury/reconciliation-export.ts` (new)
- `apps/api/src/routes/treasury/reconciliation-export.test.ts` (new)
- `apps/api/src/routes/treasury/index.ts` (register route)
- `apps/admin/lib/reconciliation-export.ts` (new)
- `apps/admin/lib/reconciliation-export.test.ts` (new)
- `apps/admin/app/treasury/reconciliation/export/page.tsx` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented reconciliation CSV export: contract + KES/CSV helpers, `@bm/wallet` per-day read model, guarded + audited API route, admin export UI; full gate green | claude-opus-4-7 |
