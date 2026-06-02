# Story 31.1: Coaching catalogue (1:1 + group)

Status: done

> Canonical ID: P5-E01-S01 · Phase: P5 · Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S01.md

## Story

As admin, I want to manage coaching offerings across pregnancy → birth → early parenting.

## Acceptance Criteria

1. New unit `coaching` in the service taxonomy.
2. Each offering: name, description, format (`one_to_one`|`group`), price, duration, optional age-stage tags ("expecting", "0-3mo", "3-6mo"...).
3. Coach assigned as a `staff` record (no login).
4. Admin CRUD with audit.

## Tasks / Subtasks

- [x] Task 1: Implement Coaching catalogue (1:1 + group) (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: New unit `coaching` in the service taxonomy.
  - [x] Satisfy AC#2: Each offering: name, description, format (`one_to_one`|`group`), price, duration, optional age-stage tags ("expecting", "0-3mo", "3-6mo"...).
  - [x] Satisfy AC#3: Coach assigned as a `staff` record (no login).
  - [x] Satisfy AC#4: Admin CRUD with audit.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P1-E07 - P3-E01-S01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p5/P5-E01-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P5-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- AC#1 — `coaching` was already a first-class unit in `SERVICE_UNITS` (added with the P1-E07 catalogue / earlier P5 prep). No new unit needed; verified it round-trips through the contract `serviceCreateSchema`, the DB `services.unit` CHECK, and `listServicesByUnit(db, "coaching")`.
- AC#2 — Coaching offerings are modeled as `services` (`unit = 'coaching'`). Three additive, nullable columns carry the coaching attributes: `format` (`one_to_one` | `group`, CHECK-constrained), `coaching_duration_minutes` (positive when set, kept separate from `salon_duration_minutes`), and `age_stage_tags` (a `text[]` FREE SET so admin can coin new stages without a migration). Name/description/price reuse the existing service + effective-dated `service_prices` machinery. Format is validated `∈ {one_to_one, group}` at the contract, repo, and DB-CHECK layers; tags are trimmed/deduped/length-bounded.
- AC#3 — A coach is a no-login `staff` record (role `coach`); the offering requires one via the existing P1-E07-S02 attribution mechanism (`attributionRoleRequired = 'coach'`). No new model, no login. The booking-time attribution gate (`checkBookingAttribution`) forces a matching active coach.
- AC#4 — Admin CRUD goes through the existing `/admin/services*` API (RBAC: `manage service`; admin/super_admin only) and the admin services page, REUSING the `catalog.service.create` / `catalog.service.update` / `catalog.service.price_change` audit actions — no new audit action registered.
- Most layers (migration 0096, db schema, contracts, catalog repo, API route, form view-model + tests) were already present on the branch. This session completed the admin UI: the services page now renders a conditional "Coaching offering" fieldset (format selector, duration, age-stage tags) when the unit is `coaching` and submits `format` / `coachingDurationMinutes` / `ageStageTags`; the coach is assigned via the existing attribution-role select (`coach`). Also added the missing `React` import (required for the page's `renderToStaticMarkup` render-contract test) and a new `app/services/page.test.tsx`.
- Verification (isolated, real output): `@bm/catalog` 273 passed; `@bm/contracts` 271 passed; `@bm/api` services route 25 passed; `@bm/admin` 326 passed (incl. new page test); `@bm/db` 43 passed. `pnpm typecheck` 18/18 successful. `pnpm lint` clean for admin, catalog, contracts, api, db.

### File List

- packages/db/migrations/0096_service_coaching_offering.sql
- packages/db/src/schema/services.ts
- packages/catalog/src/services.ts
- packages/catalog/src/services.test.ts
- packages/contracts/src/index.ts
- packages/contracts/src/index.test.ts
- apps/api/src/routes/admin/services.ts
- apps/api/src/routes/admin/services.test.ts
- apps/admin/lib/services-form.ts
- apps/admin/lib/services-form.test.ts
- apps/admin/app/services/page.tsx (this session: React import + coaching fieldset + coaching-field submission)
- apps/admin/app/services/page.test.tsx (this session: new render-contract test)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Coaching catalogue implemented (unit/format/duration/age-stage tags, coach via attribution, admin CRUD + audit); admin UI coaching fieldset wired; all affected packages green | Amelia (dev-story) |
