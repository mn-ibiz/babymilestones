# Story 27.5: Peak-hours heatmap

Status: done

> Canonical ID: P3-E05-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S05.md

## Story

As admin, I want to understand when the complex is busiest so staffing tracks demand.

## Acceptance Criteria

1. Heatmap: weekday × hour; intensity = total active sessions.
2. Filterable by unit.
3. Date range up to 12 months.

## Tasks / Subtasks

- [x] Task 1: Implement Peak-hours heatmap (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Heatmap: weekday × hour; intensity = total active sessions.
  - [x] Satisfy AC#2: Filterable by unit.
  - [x] Satisfy AC#3: Date range up to 12 months.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P2-E01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/catalog && pnpm vitest run` → 22 files, 249 tests passed.
- `cd packages/contracts && pnpm vitest run` → 9 files, 181 tests passed.
- `cd apps/api && pnpm vitest run src/routes/admin/` → 29 files, 264 tests passed.
- `cd apps/admin && pnpm vitest run app/operations lib/nav.test.ts lib/peak-hours-heatmap.test.ts` → 10 files, 46 tests passed.
- `pnpm typecheck` (root) → 17/17 tasks successful.

### Completion Notes List

- TDD: wrote failing tests first (pure aggregation, DB read, contracts query/view-model, API route, admin lib + page), confirmed red, implemented minimal, confirmed green.
- **"Session" definition**: an active session = an `attendances` check-in row. The session's timestamp is `attendances.checkedInAt`; its unit comes via `attendances.bookingId → bookings.serviceId → services.unit` (the join + unit filter live in the DB read, AC2).
- **Weekday convention**: 0 = Sunday … 6 = Saturday (JS `Date#getUTCDay()`). **Timezone basis**: UTC throughout — consistent with 27.1 / 27.2 (which key on `checkedInAt` in UTC). Hour 0–23 via `getUTCHours()`.
- **12-month guard (AC3)**: `PEAK_HOURS_MAX_DAYS = 366` inclusive days (allows a leap year, same cap the reconciliation export uses). The `peakHoursHeatmapQuerySchema` refine rejects ranges longer than this with a 400; exactly 366 days is allowed.
- Pure reducer returns a fully zero-filled 7×24 grid + total + the single hottest cell (peak); the DB read is a thin projection delegating all bucketing to it. Reused the 27.1/27.2 range + UTC-keying + admin-RBAC machinery (admin/super_admin/treasury trio; accountant 403). Read-only — no audit action, no migration.
- Added nav entry (`/operations/heatmap`, same allow-list as the operations dashboard) and a link from the operations dashboard page.

### File List

- packages/catalog/src/peak-hours-heatmap.ts (new)
- packages/catalog/src/peak-hours-heatmap.test.ts (new)
- packages/catalog/src/peak-hours-heatmap-db.ts (new)
- packages/catalog/src/peak-hours-heatmap-db.test.ts (new)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — query schema, DTO, view-model, helpers)
- packages/contracts/src/peak-hours-heatmap.test.ts (new)
- apps/api/src/routes/admin/peak-hours-heatmap.ts (new)
- apps/api/src/routes/admin/peak-hours-heatmap.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — registration)
- apps/admin/lib/peak-hours-heatmap.ts (new)
- apps/admin/lib/peak-hours-heatmap.test.ts (new)
- apps/admin/app/operations/heatmap/page.tsx (new)
- apps/admin/app/operations/heatmap/page.test.tsx (new)
- apps/admin/lib/nav.ts (modified — nav entry)
- apps/admin/app/operations/page.tsx (modified — heatmap link)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Peak-hours heatmap: pure weekday×hour aggregation + DB read, admin-gated API (12-month guard, unit filter, RBAC trio), admin heatmap page + nav + dashboard link. Tests green; typecheck clean. | Amelia (dev-story) |
