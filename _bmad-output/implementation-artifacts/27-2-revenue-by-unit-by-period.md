# Story 27.2: Revenue by unit by period

Status: done

> Canonical ID: P3-E05-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S02.md

## Story

As owner, I want to see revenue trends per business unit.

## Acceptance Criteria

1. Date-range picker; per-unit revenue line/bar chart; period-over-period delta.
2. CSV export per the same filter.
3. Excludes refunded amounts.

## Tasks / Subtasks

- [x] Task 1: Implement Revenue by unit by period (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Date-range picker; per-unit revenue line/bar chart; period-over-period delta.
  - [x] Satisfy AC#2: CSV export per the same filter.
  - [x] Satisfy AC#3: Excludes refunded amounts.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/catalog && pnpm vitest run` — 16 files / 214 tests pass (incl. new `revenue-by-period.test.ts` 10 + `revenue-by-period-db.test.ts` 4).
- `cd packages/contracts && pnpm vitest run` — 7 files / 151 tests pass (incl. new `revenue-by-period.test.ts` 9).
- `cd packages/auth && pnpm vitest run` — 10 files / 82 tests pass (new `report.revenue.export` audit action).
- `cd apps/api && pnpm vitest run src/routes/admin` — 26 files / 238 tests pass (incl. new `revenue-by-period.test.ts` 8).
- `cd apps/admin && pnpm vitest run` — 47 files / 267 tests pass (incl. new lib 6 + page 2).
- `pnpm typecheck` (root) — 17/17 tasks pass.

### Completion Notes List

- Built directly on 27.1's per-unit revenue definition (`aggregateOperationsDashboard`): REVENUE per unit = Σ(non-cancelled booking `staffRateSnapshot`) bucketed by the service's `unit`, extended from "today" to an arbitrary inclusive `[from,to]` range keyed on `bookings.checkedInAt`.
- NET revenue (AC3): a refund is a `wallet_ledger` row (`kind='refund'`, `reverses_entry_id` → the check-in debit) whose debit settled an invoice (`wallet_ledger_invoice_settlement.kind='checkin'`); that invoice's booking carries the service unit. The DB read subtracts in-period refunds (keyed on the refund's `created_at`) from each unit's gross revenue.
- Period-over-period delta (AC1): `thisPeriod − previousPeriod` per unit + total, where the previous period is the immediately-preceding equal-length range (`precedingPeriod` → `[from−N, to−N]` for an N-day inclusive period). Positive = growth; a zero previous period makes the delta equal the current revenue.
- CSV export (AC2): `revenueByPeriodToCsv` reuses the existing RFC-4180 `csvField` escaping + `centsToKes`; header + one NET row per unit + a closing `Total` row. The export endpoint reuses the SAME `revenueByPeriodQuerySchema` date-range filter as the read endpoint.
- New audit action `report.revenue.export` registered under the `export` category in `@bm/auth` (a CSV export is an audited event in this codebase). The export route emits it; the read route is not audited (a read).
- Both API endpoints are admin-gated to EXACTLY admin / super_admin / treasury (same explicit allow-list as 27.1 — narrower than `read report`, excludes accountant): 403 for accountant/reception, 401 unauth.
- Admin page lives at `/operations/revenue-trends` (separate from 27.1's `/operations/revenue` "Today's revenue" drill-down): date-range picker, per-unit chart-ready bar series + delta arrows, headline total vs previous period, and a CSV export link carrying the same filter. Linked from the operations dashboard.
- No migration (read-only reporting over existing data, as expected).

### File List

- packages/catalog/src/revenue-by-period.ts (new)
- packages/catalog/src/revenue-by-period.test.ts (new)
- packages/catalog/src/revenue-by-period-db.ts (new)
- packages/catalog/src/revenue-by-period-db.test.ts (new)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — query schema, DTOs, CSV serialiser, view-model)
- packages/contracts/src/revenue-by-period.test.ts (new)
- packages/auth/src/audit-actions.ts (modified — `report.revenue.export`)
- apps/api/src/routes/admin/revenue-by-period.ts (new)
- apps/api/src/routes/admin/revenue-by-period.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — route registration)
- apps/admin/lib/revenue-by-period.ts (new)
- apps/admin/lib/revenue-by-period.test.ts (new)
- apps/admin/app/operations/revenue-trends/page.tsx (new)
- apps/admin/app/operations/revenue-trends/page.test.tsx (new)
- apps/admin/app/operations/page.tsx (modified — link to revenue-trends)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented revenue-by-unit-by-period: range aggregation + period-over-period delta (`@bm/catalog`), date-range query schema + CSV serialiser + chart/delta view-model (`@bm/contracts`), `report.revenue.export` audit action (`@bm/auth`), admin-gated read + CSV export endpoints (`@bm/api`), and the admin revenue-trends page (`@bm/admin`). NET revenue excludes refunds. Status → review. | Amelia (dev-story) |
