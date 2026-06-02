# Story 24.2: Earnings breakdown (count of visits, top services)

Status: done

> Canonical ID: P3-E02-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S02.md

## Story

As stylist,
I want to know which services drove my earnings,
so that the capability described above is delivered.

## Acceptance Criteria

1. Below total: number of completed visits, top 3 services by count, top 3 by revenue.
2. No customer-specific information shown.

## Tasks / Subtasks

- [x] Task 1: Implement Earnings breakdown (count of visits, top services) (AC: #1, #2)
  - [x] Satisfy AC#1: Below total: number of completed visits, top 3 services by count, top 3 by revenue.
  - [x] Satisfy AC#2: No customer-specific information shown.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E02-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Extended story 24-1's pure aggregation helper `computeStaffEarnings` (`packages/catalog/src/staff-earnings.ts`) to also derive the breakdown — `completedVisits` count, `topServicesByCount`, `topServicesByRevenue` — scoped to the SAME month-to-date `[thisMonthStart, nextMonthStart)` window the headline total reflects (AC1). A completed visit is a booking accrual (`source='booking'`); refund reversals net revenue down but are NOT counted as visits. Top-3 lists are descending by metric with ties broken alphabetically by service name for deterministic output; visits with no service bucket under a stable `Unattributed` placeholder.
- New unit tests cover ties/ordering, fewer-than-3 services, zero visits, and the unattributed bucket (all written failing-first, confirmed red → green).
- Extended `PublicStaffEarningsDto` (`packages/contracts/src/index.ts`) with `completedVisits`, `topServicesByCount`, `topServicesByRevenue` and two new row DTOs. NO new PII fields.
- Extended the API route (`apps/api/src/routes/public/staff-earnings.ts`) to LEFT JOIN the commission ledger → bookings → services so each entry carries its service NAME + `isVisit` flag; only the service name crosses the boundary (no parent/child/booking id). Route test asserts the breakdown values AND that NO customer identifiers (Parent/Secret/ChildSecret/booking/invoice/parent) appear anywhere in the payload (AC2), while the service name IS present.
- Extended the admin lib (`apps/admin/lib/staff-earnings.ts`) with the breakdown types + `formatVisitCount`, `topByCountRows`, `topByRevenueRows` view-model helpers (framework-free, unit-tested incl. a key-shape test proving rows carry only `serviceName` + `detail`), and rendered the breakdown below the total in `apps/admin/app/staff-earnings/page.tsx` (added `page.test.tsx` render-contract test in the admin no-jsdom convention; imported `React` to match the existing admin page convention so `renderToStaticMarkup` works).
- Read-only reporting story — emits NO audit actions, so no `audit-actions.ts` change needed.
- Verified affected packages in isolation: `@bm/catalog` 143 pass, `@bm/contracts` 128 pass, `@bm/api` 675 pass, `@bm/admin` 226 pass. `pnpm typecheck` green across all 17 packages.

### File List

- packages/catalog/src/staff-earnings.ts (modified)
- packages/catalog/src/staff-earnings.test.ts (modified)
- packages/catalog/src/index.ts (modified)
- packages/contracts/src/index.ts (modified)
- apps/api/src/routes/public/staff-earnings.ts (modified)
- apps/api/src/routes/public/staff-earnings.test.ts (modified)
- apps/admin/lib/staff-earnings.ts (modified)
- apps/admin/lib/staff-earnings.test.ts (modified)
- apps/admin/app/staff-earnings/page.tsx (modified)
- apps/admin/app/staff-earnings/page.test.tsx (created)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 0.2 | Earnings breakdown (completed visits, top 3 services by count + revenue) implemented across catalog helper, contracts DTO, public API route, and admin viewer; PII-absence asserted by tests; status → review | Amelia (dev-story) |
