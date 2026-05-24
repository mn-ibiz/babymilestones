# Story 2.3: Add and edit children

Status: done

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

- [x] Task 1: Add `children` table (AC: #1, #4)
  - [x] In `packages/db`, add `children` table with `parent_id` FK; first_name, last_name (nullable), date_of_birth (required), gender (nullable), allergies_notes (free text, 500 char cap), `archived_at` (nullable)
  - [x] Add additive-only Drizzle migration (`0008_children.sql`)
- [x] Task 2: Children CRUD + soft-delete API (AC: #1, #3, #4, #5)
  - [x] Add route under `apps/api/src/routes/parents/children.ts` for add / edit / archive (soft-delete sets `archived_at`; historical bookings remain). Ownership scoped to the session.
  - [x] Zod schemas in `packages/contracts` (`childSchema`: DOB required + valid past date, notes ≤500 chars)
  - [x] Emit `child.created`, `child.updated`, `child.archived` to `audit_outbox`
- [x] Task 3: Age-in-months derivation (AC: #2)
  - [x] Shared `ageInMonths` helper in `@bm/contracts`; surfaced on every child via `toChild` (ready for booking selectors)
- [x] Task 4: Parent UI for children (AC: #1, #3, #4)
  - [x] In `apps/platform/app/children/`, add/edit/archive screens via `ChildForm`; all fields preserved on edit
- [x] Task 5: Tests (AC: all)
  - [x] vitest tests (test-first): schema/migration + soft-delete, contract validation, age-in-months calc, API CRUD + ownership + the three audit events

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

claude-opus-4-7

### Debug Log References

Full gate green: `pnpm test` (66 API + contracts/db/platform unit tests), `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.

### Completion Notes List

- `children` table FK references `parents.id` (the parent profile), with a `parent_id` index; `date_of_birth` stored as a calendar `date` (mode `string`) to avoid timezone drift; `archived_at` drives soft-delete.
- Ownership is enforced server-side by scoping every read/update/archive to `(id AND parentId)` where `parentId` is resolved from the session — `parent_id` is never accepted from the request body. Cross-parent edit/archive returns 404.
- `ageInMonths` is a pure shared helper in `@bm/contracts` (completed-months semantics, clamps to 0) so booking selectors reuse it rather than duplicating the calc. Surfaced on every child via the API `toChild` mapper.
- Archive is idempotent (re-archiving preserves the first timestamp) and never hard-deletes, so historical bookings stay intact.
- DOB validation rejects malformed, impossible (e.g. 2024-02-30) and future dates; notes capped at 500 chars.
- Mutating verbs require the CSRF double-submit token via the shared session guard.
- No review findings deferred.

### File List

- packages/db/migrations/0008_children.sql (new)
- packages/db/src/schema/children.ts (new)
- packages/db/src/schema/children.test.ts (new)
- packages/db/src/schema/index.ts (export children)
- packages/contracts/src/index.ts (childSchema, ageInMonths, Child, CHILD_NOTES_MAX, isoDateRegex)
- packages/contracts/src/index.test.ts (childSchema + ageInMonths tests)
- apps/api/src/routes/parents/children.ts (new)
- apps/api/src/routes/parents/children.test.ts (new)
- apps/api/src/routes/parents/index.ts (register children routes)
- apps/platform/lib/children.ts (new)
- apps/platform/lib/children.test.ts (new)
- apps/platform/lib/children-api.ts (new)
- apps/platform/app/components/ChildForm.tsx (new)
- apps/platform/app/children/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented children registry: table+migration, CRUD+soft-delete API with ownership, ageInMonths helper, parent UI, full test coverage | claude-opus-4-7 |
