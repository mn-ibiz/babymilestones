# Story 7.3: Staff data records (no logins)

Status: ready-for-dev

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

- [ ] Task 1: Add `staff` table (AC: #1)
  - [ ] In `packages/db`, add `staff` table: display_name, role ENUM (`stylist`|`instructor`|`attendant`|`coach`|`event_staff`), active, terminated_at (nullable)
  - [ ] Add additive-only Drizzle migration
  - [ ] Ensure no FK/association to `users`/auth (these are data records, not logins)
- [ ] Task 2: Staff CRUD API (AC: #2, #4)
  - [ ] Add route under `apps/api/src/routes/` for staff create/read/update/deactivate
  - [ ] Zod schemas in `packages/contracts`
  - [ ] On rename, preserve historical snapshots so prior attributions retain the name-at-time-of-booking (per Reception story S04); do not retroactively mutate booking records
  - [ ] Write audit_outbox entries on every change
- [ ] Task 3: Admin UI (AC: #2)
  - [ ] In `apps/admin`, add staff list + create/edit/deactivate screens
- [ ] Task 4: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): schema/migration, CRUD with no auth association, role ENUM, deactivation via active/terminated_at, and rename preserving historical snapshots

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
