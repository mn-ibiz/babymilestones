# Story 7.3: Staff data records (no logins)

Status: done

> Canonical ID: P1-E07-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S03.md

## Story

As an admin,
I want to maintain a list of stylists, instructors and attendants for attribution and (future) commission,
so that bookings can be attributed to real staff members.

## Acceptance Criteria

1. `staff` table: display_name, role (`stylist`|`instructor`|`attendant`|`coach`|`event_staff`), active, terminated_at.
2. Admin CRUD; no auth association.
3. Commission rate handled separately in P3-E01.
4. Renames preserve historical snapshots (see Reception story S04).

## Tasks / Subtasks

- [x] Task 1: Add `staff` table (AC: #1)
  - [x] In `packages/db`, add `staff` table: display_name, role ENUM (`stylist`|`instructor`|`attendant`|`coach`|`event_staff`), active, terminated_at (nullable)
  - [x] Add additive-only Drizzle migration (0030)
  - [x] Ensure no FK/association to `users`/auth (these are data records, not logins) — no `user_id` column; asserted in test
- [x] Task 2: Staff CRUD API (AC: #2, #4)
  - [x] Add route under `apps/api/src/routes/admin/staff.ts` for staff create/read/update/deactivate
  - [x] Zod schemas in `packages/contracts` (`staffCreateSchema`/`staffUpdateSchema`, `STAFF_ROLES`)
  - [x] On rename, preserve historical snapshots: rename mutates only the live row; booking attribution snapshots live on bookings (Reception story S04) so past records are never retroactively mutated
  - [x] Write audit_outbox entries on every change (`catalog.staff.create` / `catalog.staff.update`)
- [x] Task 3: Admin UI (AC: #2)
  - [x] In `apps/admin`, add staff list + create + deactivate/reactivate screen (`app/staff/page.tsx` + `lib/staff-form.ts`)
- [x] Task 4: Tests (AC: all)
  - [x] Write vitest unit/integration tests (test-first): schema/migration, CRUD with no auth association, role ENUM, deactivation via active/terminated_at, and rename mutating live row only (history preserved)

## Dev Notes

- `staff` are pure data records — no auth association, no logins.
- Commission rate is explicitly out of scope here (handled in P3-E01); store role only.
- Renames must preserve historical snapshots so past attributions/bookings keep the name as it was (cross-references Reception story S04). Use a snapshot/denormalized name on attribution rather than mutating history.
- Audit on every change (DoD #4 / `audit_outbox`).
- Paths to touch: `packages/db` (schema + additive migration), `apps/api/src/routes/`, `packages/contracts`, `apps/admin`. The `staff.role` ENUM should align with `services.attribution_role` (Story 7.2).
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Catalogue story → anchors to `packages/db`, `apps/admin` (and `apps/api/src/routes/` for the CRUD surface).
- Depends on P1-E10.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E07-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E07].

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- `pnpm test` first run flagged 3 pre-existing flaky hook-timeouts in unrelated suites (parents/profile, reception/topup, payments/bank/topup — "Hook timed out in 10000ms"); a re-run of `apps/api` passed 290/290 clean. New staff suites passed on first run.

### Completion Notes List

- `staff` is a pure data record: NO `user_id`/auth column, no PIN, no phone. Asserted via an information_schema column-set check.
- `staff.role` reuses the `ATTRIBUTION_ROLES` taxonomy (stylist|instructor|attendant|coach|event_staff), CHECK-constrained in migration 0030 — aligns 1:1 with `services.attribution_role_required` (P1-E07-S02).
- Soft-retirement only: `active=false` stamps `terminated_at`; reactivation clears it. No hard deletes.
- Rename (AC4): `updateStaff` mutates only the live row; booking attribution snapshots live on bookings (Reception story S04), so past attributions keep their name-at-time and are never retroactively rewritten.
- Commission rate (AC3) intentionally out of scope — role only (handled in P3-E01).
- Reused the `manage service` rbac permission (admin/super_admin) — staff records are part of the service-catalogue admin domain.
- Audit on every mutation: `catalog.staff.create`, `catalog.staff.update`.
- Review: one pass, no blocker/high-severity findings; nothing deferred.

### File List

- packages/db/migrations/0030_staff_data_records.sql (new)
- packages/db/src/schema/staff.ts (new)
- packages/db/src/schema/index.ts (export staff)
- packages/catalog/src/staff.ts (new)
- packages/catalog/src/staff.test.ts (new)
- packages/catalog/src/index.ts (export staff CRUD)
- packages/contracts/src/index.ts (staff schemas + STAFF_ROLES)
- apps/api/src/routes/admin/staff.ts (new)
- apps/api/src/routes/admin/staff.test.ts (new)
- apps/api/src/routes/admin/index.ts (register staff routes)
- apps/admin/lib/staff-form.ts (new)
- apps/admin/lib/staff-form.test.ts (new)
- apps/admin/app/staff/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented staff data records: table + migration, catalog CRUD, contracts, admin API + UI, tests; full gate green | claude-opus-4-7 |
