# Story 11.2: Children list and profile management

Status: done

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

- [x] Task 1: Children API in `apps/api` (AC: #1, #2, #3)
  - [x] Routes in `apps/api/src/routes/parents/children.ts` (registered via parents router → `apps/api/src/app.ts`): list (active + archived), create, edit, archive (soft-delete) already shipped in P1-E02-S03; this story adds `POST /parents/me/children/:id/restore` (clears `archived_at`, audited `child.restored`)
  - [x] Age in months derived in `toChild` (existing); allergies summary computed client-side on the card via the pure `allergiesSummary` helper
  - [x] Restore guarded with `@bm/auth` (ownership-scoped by id AND parentId, CSRF on POST)
- [x] Task 2: Children UI in `apps/platform` authed route group (AC: #1, #2, #3)
  - [x] Page `apps/platform/app/(app)/children/page.tsx` (moved from `app/children/`) renders child cards: name, age in months (`ageLabel`), allergies summary (`allergiesSummary`)
  - [x] Add / edit child forms (reuse `ChildForm`); archive action
  - [x] "Archived" section listing soft-deleted children with a restore action (`partitionChildren` + `restoreChild`)
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: pure-function tests (`ageLabel`, `allergiesSummary`, `partitionChildren`, draft mapping/validation) in `apps/platform/lib/children.test.ts`; API restore round-trip + auth/CSRF/ownership tests in `apps/api/src/routes/parents/children.test.ts`. (E2E not in scope — covered by integration + unit per repo convention.)

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

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (382 API + platform lib tests pass), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Stale Next.js generated types (`.next/types`) referenced the old `app/children/` path after the move; cleared `.next/types` and typecheck passed.

### Completion Notes List

- Most of the children registry (list/create/edit/archive API + a basic page + `ChildForm`) was already shipped under P1-E02-S03. This story closed the remaining 11-2 gaps:
  - Added restore (AC3): `POST /parents/me/children/:id/restore` clears `archived_at`, ownership-scoped, CSRF-guarded, audited `child.restored`; client `restoreChild`.
  - AC1 cards now show an allergies summary via the pure `allergiesSummary` helper.
  - AC3 archived section: `partitionChildren` splits active vs archived; archived listed under their own section with a Restore button.
  - Moved the page into the authed `(app)` route group (`app/(app)/children/page.tsx`) to match the story + the 11-1 wallet pattern; deleted the old `app/children/page.tsx`.
- No migration needed — `children.archived_at` already exists (0008) and supports soft-delete/restore.

### File List

- apps/api/src/routes/parents/children.ts (added restore route)
- apps/api/src/routes/parents/children.test.ts (restore tests)
- apps/platform/lib/children.ts (allergiesSummary, partitionChildren)
- apps/platform/lib/children.test.ts (tests for the above)
- apps/platform/lib/children-api.ts (restoreChild)
- apps/platform/app/(app)/children/page.tsx (new; cards + archived/restore)
- apps/platform/app/children/page.tsx (removed)
- _bmad-output/implementation-artifacts/11-2-children-list-and-profile-management-review-findings.md (review log)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented restore endpoint + allergies summary + archived section; moved page to (app) group; tests; gate green | claude-opus-4-7 |
