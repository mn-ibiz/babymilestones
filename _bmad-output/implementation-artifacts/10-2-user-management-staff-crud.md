# Story 10.2: User management (staff CRUD)

Status: ready-for-dev

> Canonical ID: P1-E10-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S02.md

## Story

As a super-admin,
I want to create staff logins and assign roles,
so that I can manage who has access to the console and what they can do.

## Acceptance Criteria

1. Create staff: email, name, role(s), initial password (auto-generated, must change on first login).
2. Edit: role(s), active flag.
3. Reset password: generates a one-time link sent via SMS-stub or shown on screen for super-admin.
4. Audit all changes.

## Tasks / Subtasks

- [ ] Task 1: Staff CRUD API in `apps/api` (AC: #1, #2, #3, #4)
  - [ ] Add routes under `apps/api/src/routes/admin/users.ts` (registered via `apps/api/src/app.ts`)
  - [ ] Create staff: validate email/name/role(s) with `@bm/contracts` Zod schema; auto-generate initial password; set must-change-on-first-login flag
  - [ ] Edit staff: update role(s) and active flag
  - [ ] Reset password: generate one-time link, dispatch via `@bm/sms` (stub adapter) or return for on-screen display to super_admin
  - [ ] Guard all routes with `@bm/auth` (super_admin only); write every mutation to `audit_outbox`
- [ ] Task 2: Staff management UI in `apps/admin` (AC: #1, #2, #3)
  - [ ] List/create/edit pages under `apps/admin/app/(console)/users/`
  - [ ] Create form (email, name, role multi-select); show generated initial password
  - [ ] Edit form (role(s), active toggle); reset-password action with on-screen link fallback
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: create issues auto-generated password + must-change flag; edit updates roles/active; reset produces one-time link via SMS-stub/on-screen; every change writes an `audit_outbox` row. Use vitest, test-first.

## Dev Notes

- Business logic lives in `apps/api` (single Fastify surface) under `apps/api/src/routes/admin/users.ts`; UI in `apps/admin`. Auth/role guards via `@bm/auth`; SMS-stub send via `@bm/sms`.
- Initial password is auto-generated and forces a change on first login (auth flow in `@bm/auth`). Reset produces a one-time link.
- All create/edit/reset mutations must write to `audit_outbox` (DoD #4 and AC4).
- Validation schemas shared via `@bm/contracts`. Any schema/table changes via `packages/db` migrations must be additive-only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- API: `apps/api/src/routes/admin/users.ts`. UI: `apps/admin/app/(console)/users/`. Contracts: `packages/db` (staff/user table — additive-only).
- Depends on P1-E01-S03 (auth foundation) and S06 per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S02.md]
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
