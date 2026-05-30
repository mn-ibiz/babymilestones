# Story 30.1: Event creation

Status: done

> Canonical ID: P4-E05-S01 · Phase: P4 · Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S01.md

## Story

As admin, I want to create an event with capacity, date, location, and pricing tiers.

## Acceptance Criteria

1. `events` table: name, description, unit (`reading_corner` | `talent_recital` | `general`), starts_at, ends_at, venue, capacity.
2. `event_ticket_tiers` table: event_id, name, price_cents, allotment, sale_starts_at, sale_ends_at.
3. Admin CRUD with audit.
4. Decision refs: 28.

## Tasks / Subtasks

- [x] Task 1: Implement Event creation (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `events` table: name, description, unit (`reading_corner` | `talent_recital` | `general`), starts_at, ends_at, venue, capacity. (migration 0067, schema `events.ts`)
  - [x] Satisfy AC#2: `event_ticket_tiers` table: event_id, name, price_cents, allotment, sale_starts_at, sale_ends_at. (migration 0068, schema `event-ticket-tiers.ts`)
  - [x] Satisfy AC#3: Admin CRUD with audit. (`/admin/events` POST/GET/GET:id/PATCH/DELETE, guarded `manage service`, audit `event.created|updated|published|unpublished|deleted`)
  - [x] Satisfy AC#4: Decision refs: 28. (event units + tiered pricing per decision 28)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; unit tests for slug gen + admin route integration (PGlite) covering auth, validation, slug uniqueness, CRUD + audit.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Design decisions
- Events are treated as **service configuration**, so admin CRUD is gated with the existing `can(role, "manage", "service")` permission (admin / super_admin) rather than introducing a new RBAC resource — adding a resource would require touching the pinned `rbac.test.ts` snapshot and the `0005` seed migration (owned by another epic; migrations are additive-only).
- Slugs are SEO-friendly and unique (numeric suffix on collision); uniqueness is checked against all rows including soft-deleted to avoid unique-index collisions.
- Events soft-delete via `deleted_at`; delete also unpublishes.

### File List
- packages/db/migrations/0067_events.sql (+ `deleted_at`)
- packages/db/migrations/0068_event_ticket_tiers.sql
- packages/db/src/schema/events.ts (+ `deletedAt`)
- packages/db/src/schema/event-ticket-tiers.ts
- packages/db/src/schema/index.ts (barrel re-exports)
- packages/contracts/src/index.ts (Event/Tier + public/order/check-in DTOs)
- packages/auth/src/audit-actions.ts (`event` action group)
- apps/api/src/routes/admin/events.ts (admin CRUD route)
- apps/api/src/routes/admin/events.test.ts
- apps/api/src/routes/admin/events-slug.ts (pure slug helpers)
- apps/api/src/routes/admin/events-slug.test.ts
- apps/api/src/routes/admin/index.ts (route registration)
- apps/admin/lib/events.ts (presentation helpers)
- apps/admin/lib/events.test.ts
- apps/admin/app/events/page.tsx (admin events screen)

### Completion Notes
- All tests green: api `events.test.ts` (6), `events-slug.test.ts` (7), admin `lib/events.test.ts` (4); `tsc --noEmit` clean for db, auth, contracts, api, admin.
- Repair (2026-05-30): the committed `events.test.ts` imported a non-existent `createTestDatabase`/`TestDatabase` from `@bm/db/testing` (the real export is `createTestDb`/`TestDb`) and used a `sessions.set` pattern that does not exist on `InMemorySessionStore`, so the suite failed to load (6 skipped). Rewrote it to the known-good `plans.test.ts` pattern (PGlite `createTestDb` + `staffUserSeed` + real `/auth/staff/login` with CSRF). events.test.ts now 6/6; full apps/api suite 524/524; `tsc --noEmit` clean. Implementation (route, contracts EventDto/EventTicketTierDto, `event.*` audit group, app.ts wiring, migrations 0067/0068, schema) was already correct.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented event + tier schema, admin CRUD with audit, slug helpers, admin UI; tests green | dev-agent |

### Project Structure Notes
- Dependencies (from source): P1-E10.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p4/P4-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P4-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
