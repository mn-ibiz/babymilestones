# Story 2.3: Add and edit children

Status: ready-for-dev

> Canonical ID: P1-E02-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S03.md

## Story

As a parent,
I want to register my children once and update their details as they grow,
so that their information stays accurate across bookings.

## Acceptance Criteria

1. Add child: first name, optional last name, date of birth (required), gender (optional), allergies/notes (free text 500 chars).
2. DOB drives age in months, surfaced on every booking selector.
3. Edit: same fields; AC fields preserved.
4. Soft-delete (mark `archived_at`); historical bookings remain.
5. Audit: `child.created`, `child.updated`, `child.archived`.

## Tasks / Subtasks

- [ ] Task 1: Add `children` table (AC: #1, #4)
  - [ ] In `packages/db`, add `children` table with `parent_id` FK; first_name, last_name (nullable), date_of_birth (required), gender (nullable), allergies_notes (free text, 500 char cap), `archived_at` (nullable)
  - [ ] Add additive-only Drizzle migration
- [ ] Task 2: Children CRUD + soft-delete API (AC: #1, #3, #4, #5)
  - [ ] Add route under `apps/api/src/routes/` (e.g. `children.ts`) for add / edit / archive (soft-delete sets `archived_at`; historical bookings remain)
  - [ ] Zod schemas in `packages/contracts` (DOB required, notes ≤500 chars)
  - [ ] Emit `child.created`, `child.updated`, `child.archived` to `audit_outbox`
- [ ] Task 3: Age-in-months derivation (AC: #2)
  - [ ] Provide a shared helper computing age in months from DOB; expose so booking selectors surface it
- [ ] Task 4: Parent UI for children (AC: #1, #3, #4)
  - [ ] In `apps/platform/app/`, add add/edit/archive child screens; preserve all fields on edit
- [ ] Task 5: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): schema/migration, CRUD + validation (DOB required, 500-char notes), age-in-months calc, soft-delete preserving historical bookings, and the three audit events

## Dev Notes

- `children` table has `parent_id` FK; `archived_at` is nullable and drives soft-delete — never hard-delete, so historical bookings remain intact.
- Age-in-months is derived from DOB and must be surfaced on every booking selector (shared helper, not duplicated logic).
- Audit event names are exactly `child.created`, `child.updated`, `child.archived` (DoD #4 / `audit_outbox`).
- Paths to touch: `packages/db` (schema + additive migration), `apps/api/src/routes/`, `packages/contracts`, `apps/platform/app/`.
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first. Cover each AC; no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `packages/db`, `apps/api/src/routes/`, `apps/platform`.
- Depends on P1-E02-S01 (parents table must exist for the `parent_id` FK).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E02].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
