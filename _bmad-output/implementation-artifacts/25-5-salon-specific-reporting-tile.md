# Story 25.5: Salon-specific reporting tile

Status: done

> Canonical ID: P3-E03-S05 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S05.md

## Story

As admin, I want salon performance at a glance.

## Acceptance Criteria

1. Tile on operational dashboard: today's bookings, no-shows, total revenue.
2. Drill-down to per-stylist breakdown.

## Tasks / Subtasks

- [x] Task 1: Implement Salon-specific reporting tile (AC: #1, #2)
  - [x] Satisfy AC#1: Tile showing today's bookings, no-shows, total revenue.
  - [x] Satisfy AC#2: Drill-down to per-stylist breakdown.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; cover each AC (pure aggregation unit tests, DB read-model, admin-gated API integration, admin lib + page render tests)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P3-E05. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- No operational dashboard / admin reporting dashboard exists yet (the story's P3-E05 / Epic 27 dependency is not built). Per the brief, built the salon reporting as a SELF-CONTAINED admin surface (data aggregation helper + admin-gated API endpoint + tile + per-stylist drill-down view), structured so Epic 27 can drop the tile into the dashboard grid later. Integration point: Epic 27 reuses `GET /admin/salon-report` + `salonReportTileViewModel`/`salonReportDrillRows` (`@bm/contracts`) + `fetchSalonReport`/`salonReportTile` (`apps/admin/lib/salon-report.ts`) to render the identical tile.
- No-show rule: a non-cancelled salon booking whose slot END time has already passed at `now` AND that was never checked in (no attendance / `checkedInAt === null`) and never completed. A future/in-progress slot today is not yet a no-show; a completed booking never is. Derived from bookings + attendance state (there is no stored no-show flag).
- Revenue rule: each non-cancelled salon booking's `staffRateSnapshot` — the service price snapshotted onto the booking + its pending/settled invoice at book time (the exact source `bookSalonSlot` writes). Summed regardless of settlement state, consistent with how the booking was invoiced. Per-stylist figures always sum to the headline totals.
- Read-only reporting story: NO new audit action and NO migration (the salon-report endpoint is a `read report`-gated read, not audited — same posture as commission-run reads).
- TDD: wrote failing tests first for the pure aggregation, the DB read model, the admin-gated API, and the admin lib/page; confirmed red → implemented → green; refactored.
- Verified affected packages in isolation + root typecheck (all green). One transient/flaky failure in an UNRELATED api test (`parents/pin.test.ts`) under heavy parallel load passed on isolated + full re-run; not caused by this change.

### File List

- packages/catalog/src/salon-reporting.ts (new)
- packages/catalog/src/salon-reporting.test.ts (new)
- packages/catalog/src/salon.ts (modified — added `listSalonReportingRowsForDate`)
- packages/catalog/src/salon.test.ts (modified — DB read-model tests)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — `SalonDayReportDto` + tile/drill-down view-models)
- packages/contracts/src/index.test.ts (modified — view-model tests)
- apps/api/src/routes/admin/salon-report.ts (new)
- apps/api/src/routes/admin/salon-report.test.ts (new)
- apps/api/src/routes/admin/index.ts (modified — register route + `AdminDeps.now`)
- apps/api/src/app.ts (modified — thread `now` into admin routes)
- apps/admin/lib/salon-report.ts (new)
- apps/admin/lib/salon-report.test.ts (new)
- apps/admin/app/salon-report/page.tsx (new)
- apps/admin/app/salon-report/page.test.tsx (new)
- apps/admin/lib/nav.ts (modified — `/salon-report` nav item)
- apps/admin/lib/nav.test.ts (modified — nav visibility test)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented salon reporting: pure aggregation helper + DB read model (`@bm/catalog`), `SalonDayReportDto` + tile/drill-down view-models (`@bm/contracts`), admin-gated `GET /admin/salon-report` endpoint (`@bm/api`), and the admin tile + per-stylist drill-down page + nav (`@bm/admin`). Built standalone (no operational dashboard yet); forward-compatible with Epic 27. Status → review. | Amelia (dev-story) |
