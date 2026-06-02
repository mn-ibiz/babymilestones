# Story 27.1: Daily operations dashboard

Status: done

> Canonical ID: P3-E05-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S01.md

## Story

As admin / owner, I want one screen showing what's happening today across all units.

## Acceptance Criteria

1. Tiles: today's revenue (total + per-unit), bookings count, active sessions, outstanding balances total, top staff today.
2. All numbers click through to drill-down.
3. Auto-refresh every 60s.
4. Permission: `admin`, `super_admin`, `treasury` (read-only).

## Tasks / Subtasks

- [x] Task 1: Implement Daily operations dashboard (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Tiles: today's revenue (total + per-unit), bookings count, active sessions, outstanding balances total, top staff today.
  - [x] Satisfy AC#2: All numbers click through to drill-down.
  - [x] Satisfy AC#3: Auto-refresh every 60s.
  - [x] Satisfy AC#4: Permission: `admin`, `super_admin`, `treasury` (read-only).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Materialised view refreshed every minute.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E03 - P2 + P3 epics
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- TDD throughout: pure aggregation (`@bm/catalog`) → contract view-models (`@bm/contracts`) → admin-gated API (`@bm/api`) → admin lib + page + drill-downs (`@bm/admin`), each red→green→refactor.
- **Units aggregated** (AC1): the `SERVICE_UNITS` enum — `play`, `talent`, `salon`, `coaching`, `event`. Per-unit revenue is always zero-filled across all five so the tile is stable; the per-unit figures sum to the headline total.
- **Data source per tile** (AC1):
  - Today's revenue (total + per-unit): non-cancelled `bookings` whose `checked_in_at` falls in the UTC day, joined to `services.unit`, summed by `staff_rate_snapshot` (the same snapshot the salon-report + staff-earnings surfaces read).
  - Bookings count today: count of those same non-cancelled bookings.
  - Active sessions: `attendances` with `checked_out_at IS NULL AND completed_at IS NULL` (in-progress check-ins, crèche or salon).
  - Outstanding balances total: centre-wide `SUM(invoices.amount_due) WHERE status NOT IN ('settled','void')` — the 22-1/22-2 definition, summed across all parents (date-independent).
  - Top staff today: today's attributed bookings grouped by `staff_id`, summed revenue, ranked desc (tie-break name then id), capped at 5; unattributed bookings count toward revenue/count but never the ranking.
- **Drill-downs** (AC2): every tile + per-unit row + top-staff row carries a `href`. Revenue→`/operations/revenue` (salon unit reuses the existing `/salon-report`); bookings→`/operations/bookings`; active sessions→`/reception/attendance`; outstanding→`/treasury/reconciliation`; top staff→`/staff-earnings`. Two new lightweight drill-down pages (`/operations/revenue`, `/operations/bookings`) reuse the same admin endpoint.
- **60s refresh** (AC3): client-side `setInterval(refresh, DASHBOARD_REFRESH_MS=60_000)` on the dashboard page, mirroring the 22-1 island-refresh pattern. NO migration / materialised view: reporting here follows the established on-demand-aggregation approach (salon-report / staff-earnings) — every figure is a fresh count off bookings + open invoices, so no DB view is warranted.
- **RBAC** (AC4): gated to EXACTLY `admin` / `super_admin` / `treasury` via an explicit allow-list in the API route and a new optional `NavItem.allowRoles` (deliberately narrower than `read report`, which also grants `accountant`). Read-only — no audit action emitted (reads are not audited).

### File List

- packages/catalog/src/operations-dashboard.ts (new)
- packages/catalog/src/operations-dashboard.test.ts (new)
- packages/catalog/src/operations-dashboard-db.ts (new)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — DTO + tile/drill-down view-models)
- packages/contracts/src/index.test.ts (modified — view-model tests)
- apps/api/src/routes/admin/operations-dashboard.ts (new)
- apps/api/src/routes/admin/operations-dashboard.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — route registration)
- apps/admin/lib/operations-dashboard.ts (new)
- apps/admin/lib/operations-dashboard.test.ts (new)
- apps/admin/lib/nav.ts (modified — `/operations` nav item + `allowRoles` gating)
- apps/admin/lib/nav.test.ts (modified — nav gating tests)
- apps/admin/app/operations/page.tsx (new)
- apps/admin/app/operations/page.test.tsx (new)
- apps/admin/app/operations/revenue/page.tsx (new)
- apps/admin/app/operations/revenue/page.test.tsx (new)
- apps/admin/app/operations/bookings/page.tsx (new)
- apps/admin/app/operations/bookings/page.test.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Daily operations dashboard: aggregation + admin-gated API + tiles/drill-downs + 60s refresh + nav. Status → review. | Amelia (dev-story) |
