# Story 1.3: Admin / Reception / Cashier login

Status: done

> Canonical ID: P1-E01-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S03.md

## Story

As an admin or staff user,
I want to log into the admin app with my email + password,
so that I can do my job.

## Acceptance Criteria

1. Email + password (not phone+PIN) → session for staff role.
2. Role determines landing page (`/reception`, `/treasury`, `/admin`).
3. Password complexity enforced at creation: ≥10 chars, mixed.
4. Same SSO cookie machinery as parents but on `admin.babymilestones.co.ke`.
5. Audit log captures `auth.staff.login`.

## Tasks / Subtasks

- [x] Task 1: Staff auth primitives in `@bm/auth` (AC: #1, #3)
  - [x] `packages/auth/src/staff.ts` — role taxonomy (`ALL_ROLES`/`STAFF_ROLES`), `isStaffRole`, `landingForRole`, `staffUserSeed` test helper
  - [~] Per orchestrator design guidance, staff reuse the parent phone+PIN primitives (argon2id `hashPin`/`verifyPin`) gated by a `users.role` column — NOT a separate email+password credential. The email+password / ≥10-char rule in the original story text is a deliberate deviation (see review-findings L1).
  - [x] Add staff login + response Zod schemas in `packages/contracts` (`staffLoginSchema`, `staffLoginResponseSchema`)
- [x] Task 2: Data model (AC: #1)
  - [~] Added additive `users.role` column (`0003_users_role.sql`, text NOT NULL DEFAULT 'parent'; taxonomy shared with RBAC story 1-6) instead of a `user_type ENUM` — see L1. Migration additive-only.
- [x] Task 3: Staff login route (AC: #1, #2, #4, #5)
  - [x] `apps/api/src/routes/auth/staff-login.ts` — validate phone+PIN, role gate, create staff session reusing `session.ts`
  - [x] Emit same `bm_session` cookie machinery as parents, scoped to `.babymilestones.co.ke`
  - [x] Resolve role → landing page (`landingForRole`: `/reception`, `/cashier`, `/admin`, …); `apps/admin/lib/role-landing.ts` surfaces the role
  - [x] Register route in `registerAuthRoutes` (buildApp)
  - [x] Write `auth.staff.login` to `audit_outbox`
- [x] Task 4: Flow isolation (AC: #1)
  - [x] Staff rejected on parent `/auth/login` (403); parents rejected on `/auth/staff/login` (403). Both audited.
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Integration: cookie issuance scoped to `.babymilestones.co.ke` from staff login
  - [x] Integration: staff rejected on parent flow and parent rejected on staff flow
  - [x] Unit: role→landing resolution; staff-role recognition; staff-login Zod schema; admin surface label

## Dev Notes

- `users.user_type ENUM('parent','staff')`: staff have email, parents have phone. Staff auth uses email + password (≥10 chars, mixed) hashed with `argon2id`.
- Cookie/session machinery is shared with the parent flow (`packages/auth/src/session.ts`), cookie scoped to `.babymilestones.co.ke`, issued from `admin.babymilestones.co.ke`.
- Source paths to touch: `packages/auth/src/staff.ts`, `apps/api/src/routes/auth/` (staff login), `packages/db` (`user_type` enum), `packages/contracts` (staff schemas), `apps/admin` (role landing).
- Testing standards: vitest, TS strict, test-first. Cover cross-domain cookie issuance and strict flow separation per source "Tests".

### Project Structure Notes
- New `packages/auth/src/staff.ts`, new staff login route under `apps/api/src/routes/auth/`, enum migration in `packages/db`.
- Dependency (from source): S01 (session machinery, `users`, `audit_outbox`).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` — 14 tasks passing (auth 26 tests, contracts 4, api 20 incl. 8 new staff-login, admin role-landing).
- `pnpm typecheck && pnpm lint && pnpm build` — all green from repo root.

### Completion Notes List

- Staff authentication reuses the parent phone+PIN primitives (argon2id, rate limiter, session cookie) per the orchestrator design guidance; the differentiator is a new additive `users.role` column and a role gate. The original story's email+password / `user_type ENUM` is intentionally not implemented — documented in review-findings L1.
- `landingForRole` routes admin/super_admin/treasury/accountant → `/admin`; reception/cashier/packer → their own surface; parent → `/dashboard`. Surfaced in `apps/admin` via `surfaceLabel`.
- Flow isolation enforced both directions with audited 403s; anti-enumeration (DUMMY_PIN_HASH constant-cost verify) and rate limiting carried over from the parent flow.
- `auth.staff.login` (success) and `auth.staff.login.failure` written to `audit_outbox`; PIN never appears in any payload.

### File List

- `packages/db/migrations/0003_users_role.sql` (new)
- `packages/db/src/schema/users.ts` (role column)
- `packages/auth/src/staff.ts` (new) + `packages/auth/src/staff.test.ts` (new)
- `packages/auth/src/index.ts` (exports)
- `packages/contracts/src/index.ts` (staff schemas) + `packages/contracts/src/index.test.ts`
- `apps/api/src/routes/auth/staff-login.ts` (new) + `apps/api/src/routes/auth/staff-login.test.ts` (new)
- `apps/api/src/routes/auth/login.ts` (staff flow-isolation 403)
- `apps/api/src/routes/auth/index.ts` (register staff login)
- `apps/admin/lib/role-landing.ts` (new) + `apps/admin/lib/role-landing.test.ts` (new)
- `_bmad-output/implementation-artifacts/1-3-admin-reception-cashier-login-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented staff phone+PIN login with role column, role-based landing, flow isolation, audit; review complete | claude-opus-4-7 |
