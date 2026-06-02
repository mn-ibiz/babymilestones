# Story 27.3: Top-staff leaderboard

Status: done

> Canonical ID: P3-E05-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S03.md

## Story

As admin, I want to see who's bringing in the most revenue this period.

## Acceptance Criteria

1. Per-staff totals, count of services, average ticket.
2. Filterable by role (stylist / instructor / attendant).
3. Click → per-staff drill-down with commission totals.

## Tasks / Subtasks

- [x] Task 1: Implement Top-staff leaderboard (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Per-staff totals, count of services, average ticket.
  - [x] Satisfy AC#2: Filterable by role (stylist / instructor / attendant).
  - [x] Satisfy AC#3: Click → per-staff drill-down with commission totals.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P3-E01 - S01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/catalog && pnpm vitest run` → 18 files / 227 tests pass
- `cd packages/contracts && pnpm vitest run` → 7 files / 156 tests pass
- `cd apps/api && pnpm vitest run` → 80 files / 734 tests pass
- `cd apps/admin && pnpm vitest run` → 50 files / 281 tests pass
- `pnpm typecheck` (root) → 17/17 packages pass

### Completion Notes List

- TDD: wrote failing tests first for each layer (pure aggregation, DB read, contracts view-models, API route, admin lib, admin pages), then implemented minimally to green.
- AC#1 definitions: REVENUE = sum of the booking `staffRateSnapshot` over non-cancelled, attributed bookings whose `checkedInAt` falls in the inclusive `[from, to]` range (the same source 27.1 / 27.2 / staff-earnings read). SERVICE COUNT = number of those attributed bookings. AVERAGE TICKET = revenue ÷ service count, truncated to whole integer cents; a staff member with zero services has an average ticket of 0 (divide-by-zero safe — never NaN). The roster is zero-filled so a staff member with no services in the period still appears. Ranking is revenue desc, then name, then id (the 27.1 tie-break).
- AC#2: role filtering is applied in the DB read by filtering the staff roster on `staff.role` (the P1-E07 attribution-role taxonomy — stylist / instructor / attendant / coach / event_staff). An empty/absent role means all roles. The role-filter control on the page offers an "All roles" option plus every attribution role.
- AC#3: the per-staff drill-down REUSES the commission ledger as the single source of truth — `loadStaffCommissionDrilldown` fetches that staff member's `commission_ledger` lines whose `occurredAt` falls in the same `[from, to]` window and nets them (accruals `source='booking'` minus reversals `source='refund_reversal'`) via the pure `aggregateStaffCommission`, the same net-per-staff math the commission run / staff-earnings surfaces use. The leaderboard row links to `/operations/leaderboard/:staffId?fromDate&toDate`.
- RBAC: both endpoints are gated to EXACTLY admin / super_admin / treasury (the same explicit allow-list as 27.1 / 27.2 — narrower than `read report`, excludes accountant). Bad range → 400; unknown role → 400; unauth → 401; non-permitted role → 403; unknown staff id on the drill-down → 404. Read-only, not audited (the catalogue forbids `*.read`). No migration.
- Nav: added a `/operations/leaderboard` nav item (same allow-list) for discoverability, plus a link from the operations dashboard page. The nested `/operations/leaderboard/:staffId` route is already gated by the existing nested-segment route guard.

### File List

- packages/catalog/src/staff-leaderboard.ts (new)
- packages/catalog/src/staff-leaderboard.test.ts (new)
- packages/catalog/src/staff-leaderboard-db.ts (new)
- packages/catalog/src/staff-leaderboard-db.test.ts (new)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — query schema, DTOs, view-models, role options)
- packages/contracts/src/index.test.ts (modified — leaderboard contract tests)
- apps/api/src/routes/admin/staff-leaderboard.ts (new)
- apps/api/src/routes/admin/staff-leaderboard.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — route registration)
- apps/admin/lib/staff-leaderboard.ts (new)
- apps/admin/lib/staff-leaderboard.test.ts (new)
- apps/admin/app/operations/leaderboard/page.tsx (new)
- apps/admin/app/operations/leaderboard/page.test.tsx (new)
- apps/admin/app/operations/leaderboard/[staffId]/page.tsx (new)
- apps/admin/app/operations/leaderboard/[staffId]/page.test.tsx (new)
- apps/admin/app/operations/page.tsx (modified — leaderboard link)
- apps/admin/lib/nav.ts (modified — leaderboard nav item)
- apps/admin/lib/nav.test.ts (modified — leaderboard nav assertion)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented top-staff leaderboard: pure per-staff revenue/service-count/avg-ticket aggregation + commission drill-down, DB reads (role filter), contracts view-models, admin-gated API (leaderboard + per-staff commission), admin page + role filter + drill-down. TDD; all affected packages + typecheck green. Status → review. | Amelia (dev-story) |
