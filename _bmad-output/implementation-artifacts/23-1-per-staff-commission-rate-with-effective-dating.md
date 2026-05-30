# Story 23.1: Per-staff commission rate with effective dating

Status: done

> Canonical ID: P3-E01-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S01.md

## Story

As admin, I want each stylist's commission percentage to be configurable and to support changes over time.

## Acceptance Criteria

1. `staff_commission_rates` table: staff_id, rate_percent (decimal), effective_from, effective_to (nullable), reason.
2. Admin CRUD; setting a new rate auto-closes the previous one.
3. Bookings join commission via `effective_from ≤ booking.created_at < effective_to`.
4. Audit on every rate change.
5. Decision refs: 6, 15.

## Tasks / Subtasks

- [x] Task 1: Implement Per-staff commission rate with effective dating (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: `staff_commission_rates` table: staff_id, rate_percent (decimal), effective_from, effective_to (nullable), reason. (migration 0059 + schema)
  - [x] Satisfy AC#2: Admin CRUD; setting a new rate auto-closes the previous one. (`setCommissionRate` atomic close-then-insert + admin route + console form)
  - [x] Satisfy AC#3: Bookings join commission via `effective_from ≤ booking.created_at < effective_to`. (`resolveRateAt` half-open interval)
  - [x] Satisfy AC#4: Audit on every rate change. (`commission.rate.set` audit on POST)
  - [x] Satisfy AC#5: Decision refs: 6, 15. (effective-dated rate model; integer-cents `commissionCents` for S02 ledger)
  - [x] Touch / create: `packages/catalog/src/staff.ts` (re-exports the rate logic from `commission-rates.ts`)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`packages/catalog/staff.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/catalog exec vitest run` — 133 passed
- `pnpm -C packages/db exec vitest run` — 98 passed
- `pnpm -C apps/api exec vitest run src/routes/admin/` — 102 passed
- `pnpm -C packages/auth exec vitest run` — 118 passed (audit completeness + rbac snapshot)
- `pnpm -C apps/admin exec vitest run lib/commission-rate-form.test.ts` — 6 passed
- typecheck clean: db, catalog, auth, api, admin

### Completion Notes List

- `staff_commission_rates` (migration 0059) stores a decimal `rate_percent` (numeric(5,2)) with a HALF-OPEN `[effective_from, effective_to)` interval; `effective_to` NULL marks the single open rate, fenced by a partial unique index (`one_open_per_staff`) so a concurrent double-open is impossible (AC1).
- `setCommissionRate` (catalog) auto-closes the prior open rate to the new `effective_from` then inserts the new open row, atomically in one transaction (AC2). A same-instant correction replaces the open row in place (no zero-width interval); a backdated `effective_from` is rejected.
- `resolveRateAt` implements the exact AC3 predicate `effective_from ≤ at < effective_to` (boundary belongs to the successor). `commissionCents` computes the amount in INTEGER cents (no float drift, half-up) for the S02 ledger.
- Admin CRUD: `POST/GET /admin/staff/:id/commission-rates` (Fastify, `manage service` guard like the staff records they attach to); every set is audited `commission.rate.set` (AC4); reads are not audited. Admin-console surface: `app/commission-rates` page + `lib/commission-rate-form.ts` validation.

### File List

- packages/db/migrations/0059_staff_commission_rates.sql (new)
- packages/db/src/schema/staff-commission-rates.ts (new)
- packages/db/src/schema/index.ts (export)
- packages/catalog/src/commission-rates.ts (new)
- packages/catalog/src/commission-rates.test.ts (new)
- packages/catalog/src/commission-cents.test.ts (new)
- packages/catalog/src/staff.ts (re-export rate logic)
- packages/catalog/src/index.ts (export)
- packages/auth/src/audit-actions.ts (commission audit actions)
- apps/api/src/routes/admin/commission-rates.ts (new)
- apps/api/src/routes/admin/commission-rates.test.ts (new)
- apps/api/src/routes/admin/index.ts (wire route)
- apps/admin/lib/commission-rate-form.ts (new)
- apps/admin/lib/commission-rate-form.test.ts (new)
- apps/admin/app/commission-rates/page.tsx (new)
- apps/admin/app/commission-rates/commission-rates-client.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented effective-dated commission rates (migration 0059, catalog logic, admin route + console), TDD; all ACs met | Claude Opus 4.8 (1M context) |
