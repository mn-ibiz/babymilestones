# Story 2.1: Parent self-registers with profile details

Status: ready-for-dev

> Canonical ID: P1-E02-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S01.md

## Story

As a parent,
I want to add my name, language preference, and emergency contact during signup,
so that the system knows me.

## Acceptance Criteria

1. After PIN setup, an inline profile form captures: first name, last name, optional email, residential area (free text).
2. Required fields validated; email regex permissive (RFC 5322 light).
3. Skip allowed; profile completion banner shown until done.
4. Profile edit available from dashboard at any time.

## Tasks / Subtasks

- [ ] Task 1: Add `parents` table to shared schema (AC: #1)
  - [ ] In `packages/db`, add `parents` table with FK to `users` (one parent per user; no joint accounts for v1): first_name, last_name, email (nullable), residential_area (nullable free text)
  - [ ] Add additive-only Drizzle migration in `packages/db`
- [ ] Task 2: Profile create/update API (AC: #1, #2, #4)
  - [ ] Add route under `apps/api/src/routes/` (e.g. `parents.ts`) for create/get/update of the authed parent profile
  - [ ] Define Zod schemas in `packages/contracts` (RFC 5322-light permissive email regex; required first/last name)
  - [ ] On any create/update, write to `audit_outbox`
- [ ] Task 3: Inline profile form post-PIN-setup (AC: #1, #3)
  - [ ] In `apps/platform/app/`, render inline profile form after PIN setup
  - [ ] Allow skip; show profile-completion banner until profile is complete
- [ ] Task 4: Dashboard profile edit (AC: #4)
  - [ ] In `apps/platform/app/`, add profile edit screen reachable from the parent dashboard at any time
- [ ] Task 5: Tests (AC: all)
  - [ ] Write vitest unit/integration tests (test-first): schema/migration, validation (required fields + permissive email), skip+banner behavior, edit flow, and audit_outbox write

## Dev Notes

- `parents` table FKs to `users`; exactly one parent per user (no joint accounts in v1).
- Email validation is permissive (RFC 5322 light) — keep it forgiving, not strict.
- Audited actions must write to `audit_outbox` (DoD #4).
- Paths to touch: `packages/db` (schema + additive migration), `apps/api/src/routes/`, `packages/contracts` (Zod), `apps/platform/app/` (inline form + dashboard edit).
- Testing standards: vitest, `pnpm test` per workspace, TS strict, test-first (red/green/refactor). Cover each AC with unit/integration/E2E as appropriate (DoD #2); no regression in `e2e/`.

### Project Structure Notes
- Registry story → anchors to `packages/db`, `apps/api/src/routes/`, `apps/platform`.
- Depends on P1-E01-S01 (user/PIN setup must exist before the inline profile form fires).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E02-S01.md]
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
