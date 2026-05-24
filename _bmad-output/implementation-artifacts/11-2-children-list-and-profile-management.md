# Story 11.2: Children list and profile management

Status: ready-for-dev

> Canonical ID: P1-E11-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S02.md

## Story

As a parent,
I want to add and edit my children from my dashboard,
so that I can keep their profiles current and manage who is active.

## Acceptance Criteria

1. List view with child cards (name, age in months, allergies summary).
2. Add child / edit child / archive child flows.
3. Soft-deleted children visible under "Archived" with restore.

## Tasks / Subtasks

- [ ] Task 1: Children API in `apps/api` (AC: #1, #2, #3)
  - [ ] Add routes `apps/api/src/routes/children.ts` (registered via `apps/api/src/app.ts`): list (active + archived), create, edit, archive (soft-delete), restore
  - [ ] Compute age in months and allergies summary for list payloads
  - [ ] Guard with `@bm/auth` (parent owns the child records); validate with `@bm/contracts`
- [ ] Task 2: Children UI in `apps/platform` authed route group (AC: #1, #2, #3)
  - [ ] Page `apps/platform/app/(app)/children/page.tsx` rendering child cards (name, age in months, allergies summary)
  - [ ] Add / edit child forms; archive action
  - [ ] "Archived" section listing soft-deleted children with a restore action
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: list shows cards with correct age/allergies; add/edit persist; archive soft-deletes (record retained); archived list + restore round-trip. Use vitest, test-first.

## Dev Notes

- Parent dashboard surface in `apps/platform` authed route group (`apps/platform/app/(app)/children/`), mobile-first, calling `apps/api`. UI primitives from `packages/ui`.
- Archive is a **soft delete** (AC3) — children remain retrievable and restorable; ensure the children table supports a soft-delete flag (additive migration in `packages/db`).
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/children.ts`, `apps/platform/app/(app)/children/`, child table/soft-delete column in `packages/db`.
- Depends on P1-E02 (child profiles foundation) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
