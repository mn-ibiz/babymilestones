# Story 7.1: CRUD services with effective-dated price history

Status: done

> Canonical ID: P1-E07-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S01.md

## Story

As an admin,
I want to manage the list of paid services and their prices without code changes,
so that pricing stays current without engineering involvement.

## Acceptance Criteria

1. `services` table: name, description, unit (`play`, `talent`, `salon`, `coaching`, `event`), is_active, attribution_role_required (nullable).
2. `service_prices` table: service_id, amount_cents, effective_from, effective_to (nullable).
3. Creating a price change preserves the old row (sets `effective_to`) and inserts a new one.
4. Lookup at booking time uses the row matching `booking_date`.
5. Audit on every change.

## Tasks / Subtasks

- [x] Task 1: Add catalogue tables (AC: #1, #2)
  - [x] In `packages/db`, add `services` (name, description, unit ENUM `play`/`talent`/`salon`/`coaching`/`event`, is_active, attribution_role_required nullable) and `service_prices` (service_id FK, amount_cents, effective_from, effective_to nullable)
  - [x] Add additive-only Drizzle migration (`0028_services_price_history.sql`, CHECK on unit enum + non-negative cents + well-formed range)
- [x] Task 2: Catalogue domain logic (AC: #2, #3, #4)
  - [x] In `packages/catalog/services.ts`, implement service create/update (soft-delete via `is_active=false`, no hard deletes; `unit` immutable)
  - [x] Implement price-change in a transaction: close the current open row by setting `effective_to`, then insert the new open row; reject backdated/same-date prices (`ServicePriceOrderError`)
  - [x] Implement `resolveServicePriceAt` returning the row whose half-open `[effective_from, effective_to)` range contains a given `booking_date`
- [x] Task 3: Admin API (AC: #1, #2, #3, #5)
  - [x] Added `apps/api/src/routes/admin/services.ts` for service + price CRUD, calling `@bm/catalog`, guarded by `manage service`
  - [x] Zod schemas in `packages/contracts` (`serviceCreateSchema`, `serviceUpdateSchema`, `servicePriceCreateSchema`)
  - [x] Write an audit_outbox entry on every create/update/price-change
- [x] Task 4: Admin UI (AC: #1, #2, #3)
  - [x] In `apps/admin`, added `/services` screen (list, create, soft-delete toggle, price history + set-new-price) + `lib/services-form.ts` pure view logic with tests
- [x] Task 5: Tests (AC: all)
  - [x] vitest unit/integration tests (test-first): schema/migration, soft-delete (no hard delete), price-change preserving old row + inserting new, effective-dated lookup by booking_date, the order guard, and audit on every change

## Dev Notes

- Core logic lives in `packages/catalog/services.ts`. No deletes — soft-delete via `is_active=false`.
- Price history is effective-dated: a change never mutates amount in place; it closes the prior row (`effective_to`) and inserts a new one. Lookups resolve by `booking_date` falling within `[effective_from, effective_to)`.
- Amounts are stored as `amount_cents` (integer).
- Audit on every change (DoD #4 / `audit_outbox`).
- Paths to touch: `packages/catalog` (services.ts), `packages/db` (schema + additive migration), `apps/admin`, plus `apps/api/src/routes/` and `packages/contracts` for the admin API surface.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Catalogue story → anchors to `packages/catalog`, `packages/db`, `apps/admin`.
- Depends on P1-E10.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E07].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green (274 API tests pass).
- Initial catalog test failure: `drizzle-orm` not declared as a `@bm/catalog` dependency → added it.

### Completion Notes List

- `services` + `service_prices` tables added with an additive migration (0028). Money is integer cents (bigint). Price history uses a half-open `[effective_from, effective_to)` range; the open/current row has a null `effective_to`. CHECK constraints enforce the unit enum, non-negative cents, and a well-formed closed range.
- Domain logic in `@bm/catalog` (`services.ts`): create/update (soft-delete only, `unit` immutable), `setServicePrice` (atomic close-old + insert-new in a transaction), `listServicePrices`, `resolveServicePriceAt`.
- Review fix (BLOCKER): `setServicePrice` now rejects a new price whose `effectiveFrom` is not strictly after the current open row's — previously this closed the old row to an invalid range and raised an uncaught DB 500. Raises `ServicePriceOrderError`, mapped to HTTP 409 in the route. Covered by tests at both layers.
- Admin API under `/admin/services*` guarded by `manage service` (admin/super_admin); audit on every mutation.
- Admin UI: `apps/admin/app/services/page.tsx` + pure `lib/services-form.ts` (unit-tested).

### File List

- packages/db/src/schema/services.ts (new)
- packages/db/src/schema/index.ts (export added)
- packages/db/migrations/0028_services_price_history.sql (new)
- packages/catalog/src/services.ts (new)
- packages/catalog/src/services.test.ts (new)
- packages/catalog/src/index.ts (exports added)
- packages/catalog/package.json (drizzle-orm dep)
- packages/contracts/src/index.ts (service schemas added)
- apps/api/src/routes/admin/services.ts (new)
- apps/api/src/routes/admin/services.test.ts (new)
- apps/api/src/routes/admin/index.ts (route registered)
- apps/api/package.json (@bm/catalog dep)
- apps/admin/lib/services-form.ts (new)
- apps/admin/lib/services-form.test.ts (new)
- apps/admin/app/services/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented services + effective-dated price history (db, catalog, API, admin UI); review fix for backdated-price 500 → 409 | claude-opus-4-7 |
