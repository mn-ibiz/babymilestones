# Story 10.3: Audit log viewer

Status: ready-for-dev

> Canonical ID: P1-E10-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S03.md

## Story

As an admin,
I want to search the audit log to investigate disputes,
so that I can trace who did what, when, and to which record.

## Acceptance Criteria

1. Searchable by actor (user), action, target ID, date range.
2. Pagination; CSV export.
3. Audit log itself is read-only — no edits, no deletes.

## Tasks / Subtasks

- [ ] Task 1: Audit query API in `apps/api` (AC: #1, #2, #3)
  - [ ] Add read-only route `apps/api/src/routes/admin/audit.ts` (registered via `apps/api/src/app.ts`)
  - [ ] Query the `audit_log` projection table (populated by the X5 audit projection) filtered by actor, action, target ID, date range
  - [ ] Paginated list endpoint + CSV export endpoint (stream/serialize rows)
  - [ ] Expose **no** create/update/delete endpoints — read-only by construction; guard with `@bm/auth` (admin)
- [ ] Task 2: Audit viewer UI in `apps/admin` (AC: #1, #2)
  - [ ] Page `apps/admin/app/(console)/audit/page.tsx` with filter controls (actor, action, target ID, date range)
  - [ ] Paginated results table; "Export CSV" download button
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: each filter narrows results correctly; pagination boundaries; CSV export contents; assert no write/delete path exists against `audit_log`. Use vitest, test-first.

## Dev Notes

- Reads from the `audit_log` projection table populated by X5 (per source Technical Notes — "Read from the projection table populated by X5"). This story is strictly read-only: no migrations that write to or mutate `audit_log`.
- API lives in `apps/api` (`apps/api/src/routes/admin/audit.ts`); UI in `apps/admin` (`apps/admin/app/(console)/audit/`). Filters defined in `@bm/contracts`.
- Read-only enforcement (AC3): expose only GET/list/export; no edit or delete routes for audit data.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only (DoD #3).

### Project Structure Notes
- `apps/api/src/routes/admin/audit.ts`, `apps/admin/app/(console)/audit/`. Table `audit_log` is owned/populated by X5 — consume only.
- Depends on X5 (audit projection) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E10.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
