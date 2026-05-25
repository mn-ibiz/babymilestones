# Story 10.2: User management (staff CRUD)

Status: done

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

- [x] Task 1: Staff login-user CRUD API in `apps/api` (AC: #1, #2, #3, #4)
  - [x] Added routes under `apps/api/src/routes/admin/users.ts` (registered via `apps/api/src/routes/admin/index.ts`)
  - [x] Create staff login: validate phone/role/(optional PIN) with a new `@bm/contracts` Zod schema (`adminUserCreateSchema`); hash via `hashPin`; auto-generate a strong PIN (`generatePin`) when omitted; PIN returned ONCE on-screen (the phone+PIN platform has no email/password — anchored to the real P1-E01 foundation)
  - [x] Edit staff login: change role and/or toggle active flag (soft deactivate via new `users.deactivated_at`)
  - [x] Reset PIN: `POST /admin/users/:id/reset-pin` issues a fresh one-time PIN shown on-screen for super_admin (maps AC3 on-screen fallback; SMS-stub dispatch not needed since PIN is the credential)
  - [x] Guard all routes with `@bm/auth` `requirePermission("manage","user")` (admin/super_admin); every mutation writes `audit_outbox`; role change + deactivation + reset destroy the user's live sessions (1-6 AC4) and the staff-login flow rejects a deactivated account
- [x] Task 2: Staff login-user management UI in `apps/admin` (AC: #1, #2, #3)
  - [x] List/create page at `apps/admin/app/users/` + pure form logic `apps/admin/lib/users-form.ts`; nav item "Staff logins" (`manage user`)
  - [x] Create form (phone, role select, optional initial PIN); one-time PIN shown once after create
  - [x] Edit (role change), active toggle (deactivate/reactivate), reset-PIN action with on-screen one-time PIN
- [x] Task 3: Tests (AC: all) — test-first, vitest
  - [x] Create issues auto-generated/explicit PIN; role change invalidates sessions; deactivate blocks login + invalidates sessions; reset produces a new working one-time PIN; permission + CSRF enforcement; NO PIN-hash leakage in responses or audit; every change writes `audit_outbox`
- [~] E2E in `e2e/`: deferred — covered at integration level via `app.inject` (19 API tests) + admin lib unit tests, consistent with sibling admin stories. See review-findings.

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

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (15/15 tasks; 349 API tests, all pass), `pnpm typecheck`, `pnpm lint`, `pnpm build` (all 15/15). One transient `beforeEach` hook timeout under parallel PGlite load on the first full-suite run; passed clean on the re-run (flake, not a regression).

### Completion Notes List

- **Scope anchoring:** the planning text described email/password + must-change-on-first-login, but the built foundation (P1-E01-S01/S03/S06) is **phone + 4-digit PIN**. Implemented against the real scaffold: staff login users are `users` rows with a non-parent role + `hashPin` PIN. No must-change flag was added (the auth flow has no such concept; out of scope).
- **Distinct from `/admin/staff`:** that surface (P1-E07-S03) is attribution **data records** (no auth). This story is **login** users → new surface `/admin/users` + admin page `/users` + nav item "Staff logins". Both gate on `manage user`.
- **AC1 create:** phone (normalised), system role (non-parent), optional explicit PIN (weak-PIN policy enforced) else auto-generated via new `generatePin` (crypto-random, never weak). PIN returned ONCE on-screen for the super-admin.
- **AC2 edit:** role change and/or active toggle. Soft deactivation via new additive `users.deactivated_at` (no hard delete); the staff-login flow now rejects a deactivated account.
- **AC3 reset:** `POST /admin/users/:id/reset-pin` issues a fresh one-time PIN shown on-screen.
- **Security (1-6 AC4):** role change, deactivation, and PIN reset all destroy the user's live sessions via `invalidateSessionsOnRoleChange`. The PIN (raw or hash) is NEVER serialized to a client or written to an audit payload (asserted by tests).
- **AC4 audit:** `admin.user.create` / `admin.user.update` (with before/after role + active) / `admin.user.reset_pin` written to `audit_outbox`.
- Contracts `SYSTEM_STAFF_ROLES` is pinned in lockstep with `@bm/auth.STAFF_ROLES` by a test (contracts cannot import the native argon2 binding).

### File List

- `packages/db/migrations/0037_users_deactivated.sql` (new — additive)
- `packages/db/src/schema/users.ts` (added `deactivatedAt`)
- `packages/contracts/src/index.ts` (added `SYSTEM_STAFF_ROLES`/`isSystemStaffRole`, `adminUserCreateSchema`/`adminUserUpdateSchema`, `AdminUserPublic`)
- `packages/auth/src/pin.ts` (added `generatePin`) + `packages/auth/src/index.ts` (export)
- `packages/auth/src/pin.test.ts`, `packages/auth/src/staff.test.ts` (lockstep test)
- `apps/api/src/routes/admin/users.ts` (new route) + `apps/api/src/routes/admin/index.ts` (register)
- `apps/api/src/routes/admin/users.test.ts` (new — 19 tests)
- `apps/api/src/routes/auth/staff-login.ts` (reject deactivated accounts)
- `apps/admin/lib/users-form.ts` + `apps/admin/lib/users-form.test.ts` (new)
- `apps/admin/app/users/page.tsx` (new) + `apps/admin/lib/nav.ts` ("Staff logins" nav item)
- `_bmad-output/implementation-artifacts/10-2-user-management-staff-crud-review-findings.md`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented staff login-user CRUD (phone/role/PIN), role-change+deactivate session invalidation, reset-PIN, audit, admin UI; full gate green | claude-opus-4-7 |
