# Story 7.2: Attribution role per service

Status: ready-for-dev

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

- [ ] Task 1: Add attribution_role to services (AC: #1)
  - [ ] In `packages/db`, add nullable `attribution_role` ENUM to `services` (aligned with staff roles)
  - [ ] Add additive-only Drizzle migration
- [ ] Task 2: Expose attribution_role in catalogue + API (AC: #1, #2, #3)
  - [ ] In `packages/catalog`, include `attribution_role` in service read/write
  - [ ] Update `packages/contracts` Zod schemas; surface field via the service admin route in `apps/api/src/routes/`
- [ ] Task 3: Enforce in Reception booking flow (AC: #2, #3)
  - [ ] In `apps/admin` (Reception booking flow), when a service has a non-null `attribution_role`, require selecting a `staff` member from that role's active members
  - [ ] When null, leave attribution optional
- [ ] Task 4: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): nullable ENUM persistence, forced staff pick (filtered to role + active) when non-null, optional attribution when null

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
