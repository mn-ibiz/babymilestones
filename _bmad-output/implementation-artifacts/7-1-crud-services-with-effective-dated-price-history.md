# Story 7.1: CRUD services with effective-dated price history

Status: ready-for-dev

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

- [ ] Task 1: Add catalogue tables (AC: #1, #2)
  - [ ] In `packages/db`, add `services` (name, description, unit ENUM `play`/`talent`/`salon`/`coaching`/`event`, is_active, attribution_role_required nullable) and `service_prices` (service_id FK, amount_cents, effective_from, effective_to nullable)
  - [ ] Add additive-only Drizzle migration
- [ ] Task 2: Catalogue domain logic (AC: #2, #3, #4)
  - [ ] In `packages/catalog/services.ts`, implement service create/update (soft-delete via `is_active=false`, no hard deletes)
  - [ ] Implement price-change: close the current row by setting `effective_to`, then insert the new row
  - [ ] Implement price lookup that returns the row whose effective range contains a given `booking_date`
- [ ] Task 3: Admin API (AC: #1, #2, #3, #5)
  - [ ] Add route under `apps/api/src/routes/` for service + price CRUD, calling `packages/catalog`
  - [ ] Zod schemas in `packages/contracts`
  - [ ] Write an audit_outbox entry on every create/update/price-change
- [ ] Task 4: Admin UI (AC: #1, #2, #3)
  - [ ] In `apps/admin`, add screens to manage services and effective-dated prices
- [ ] Task 5: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): schema/migration, soft-delete (no hard delete), price-change preserving old row + inserting new, effective-dated lookup by booking_date, and audit on every change

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
