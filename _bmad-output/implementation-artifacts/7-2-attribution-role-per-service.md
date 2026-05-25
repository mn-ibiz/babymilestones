# Story 7.2: Attribution role per service

Status: done

> Canonical ID: P1-E07-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S02.md

## Story

As an admin,
I want each service to declare whether it needs a staff attribution slot (stylist for salon; instructor for talent; none for events),
so that bookings capture the right staff member where required.

## Acceptance Criteria

1. `services.attribution_role` ENUM nullable.
2. If non-null, Reception's booking flow forces a `staff` pick from that role's active members.
3. If null, attribution is optional.

## Tasks / Subtasks

- [x] Task 1: Add attribution_role to services (AC: #1)
  - [x] In `packages/db`, constrain the nullable `attribution_role_required` column (created free-text by 7-1) to the staff-role taxonomy ENUM via a typed `$type<AttributionRole>()` + DB CHECK
  - [x] Add additive-only migration `0029_service_attribution_role.sql` (idempotent CHECK)
- [x] Task 2: Expose attribution_role in catalogue + API (AC: #1, #2, #3)
  - [x] In `packages/catalog`, type `attributionRoleRequired` to the enum; add `getServiceAttributionRole`, `checkBookingAttribution`, `isAttributionRole`, `ATTRIBUTION_ROLES`
  - [x] Update `packages/contracts` Zod schemas (`ATTRIBUTION_ROLES`, `isAttributionRole`, validated `attributionRoleRequired`); the `apps/api` admin service route already wires create/patch through the schema
- [~] Task 3: Enforce in Reception booking flow (AC: #2, #3) — partial; booking-flow wiring DEFERRED to P1-E07-S03 (the `staff` table does not exist yet)
  - [~] The pure gate `checkBookingAttribution(requiredRole, staff)` (forces an active staff member of the required role; optional when null) + the read `getServiceAttributionRole` are shipped + tested; the Reception route (`record-visit.ts`) consumes them once staff records land. Admin surface (`apps/admin/app/services`) now exposes the attribution-role selector. See review-findings.
  - [x] When null, attribution optional (gate returns ok; contract collapses empty→null)
- [x] Task 4: Tests (AC: all)
  - [x] vitest, test-first: nullable ENUM persistence + read-back, DB CHECK rejects out-of-taxonomy roles, contract + admin-form validation, API create/patch with valid/invalid roles + permission, and the forced/active/role-match vs optional booking gate

## Dev Notes

- `attribution_role` is a nullable ENUM on `services`; values map to staff roles (e.g. stylist/instructor) — keep consistent with the `staff.role` ENUM from Story 7.3.
- Enforcement is in the Reception booking flow: non-null role → mandatory staff pick limited to that role's active members; null → optional.
- Audit per the catalogue change rules established in Story 7.1 (DoD #4 / `audit_outbox`).
- Paths to touch: `packages/db` (column + additive migration), `packages/catalog`, `packages/contracts`, `apps/api/src/routes/`, `apps/admin`.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Catalogue story → anchors to `packages/catalog`, `packages/db`, `apps/admin`.
- Depends on P1-E07-S01 (services table). Staff-role filtering aligns with P1-E07-S03.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E07].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green: `pnpm test` (all workspaces), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- 7-1 created `services.attribution_role_required` as free text. This story
  constrains it to a nullable ENUM aligned with the P1-E07-S03 staff-role
  taxonomy (`stylist | instructor | attendant | coach | event_staff`) — NOT the
  RBAC roles — via a typed Drizzle `$type<AttributionRole>()` plus a DB CHECK
  (additive migration 0029, idempotent `DO`-block).
- `@bm/contracts` is the single source of truth (`ATTRIBUTION_ROLES`,
  `isAttributionRole`); the create/update Zod schemas validate the field and
  reject free-text / RBAC roles. `@bm/db` duplicates the literal union (db must
  not depend on contracts) with the migration CHECK as the runtime authority.
- AC2's full Reception enforcement is DEFERRED to P1-E07-S03 (no `staff` table
  yet). Shipped the shared pure gate `checkBookingAttribution` + the read
  `getServiceAttributionRole` so the Reception route adopts the rule with no
  re-derivation once staff records exist. Admin services page surfaces the
  attribution-role selector + list column. See `*-review-findings.md`.

### File List

- packages/db/src/schema/services.ts (typed column + `AttributionRole`)
- packages/db/migrations/0029_service_attribution_role.sql (new)
- packages/contracts/src/index.ts (`ATTRIBUTION_ROLES`, `isAttributionRole`, validated schemas)
- packages/contracts/src/index.test.ts (new tests)
- packages/catalog/src/services.ts (enum types, `getServiceAttributionRole`, `checkBookingAttribution`, `serviceAttributionRole`, `isAttributionRole`, `ATTRIBUTION_ROLES`)
- packages/catalog/src/index.ts (exports)
- packages/catalog/src/services.test.ts (updated + new tests)
- apps/api/src/routes/admin/services.test.ts (new API tests)
- apps/admin/lib/services-form.ts (`attributionRoleOptions`, `attributionRoleLabel`, validation)
- apps/admin/lib/services-form.test.ts (new tests)
- apps/admin/app/services/page.tsx (attribution-role selector + list column)
- _bmad-output/implementation-artifacts/7-2-attribution-role-per-service-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Attribution-role ENUM (CHECK-constrained), contract/catalog/API/admin surface, booking-attribution gate primitive; AC2 booking-flow wiring deferred to P1-E07-S03 | claude-opus-4-7 |
