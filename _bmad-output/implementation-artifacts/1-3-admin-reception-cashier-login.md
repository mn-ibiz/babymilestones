# Story 1.3: Admin / Reception / Cashier login

Status: ready-for-dev

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

- [ ] Task 1: Staff auth primitives in `@bm/auth` (AC: #1, #3)
  - [ ] `packages/auth/src/staff.ts` — email+password hash/verify (`argon2id`), password complexity rule (≥10 chars, mixed) enforced at creation
  - [ ] Add staff login/credential Zod schemas in `packages/contracts`
- [ ] Task 2: Data model (AC: #1)
  - [ ] Confirm/migrate `users.user_type ENUM('parent','staff')` in `packages/db` (additive-only); staff carry email, parents carry phone
- [ ] Task 3: Staff login route (AC: #1, #2, #4, #5)
  - [ ] `apps/api/src/routes/auth/staff-login.ts` (under `routes/auth`) — validate email+password, create staff session reusing `session.ts`
  - [ ] Emit same `bm_session` cookie machinery as parents, scoped to `.babymilestones.co.ke` (issued from `admin.babymilestones.co.ke`)
  - [ ] Resolve role → landing page (`/reception`, `/treasury`, `/admin`); surface role in `apps/admin`
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
  - [ ] Write `auth.staff.login` to `audit_outbox`
- [ ] Task 4: Flow isolation (AC: #1)
  - [ ] Staff cannot authenticate via the parent phone+PIN flow and parents cannot use the staff email+password flow
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Integration: cross-domain cookie issuance from `admin.*`
  - [ ] Integration: staff rejected on parent flow and vice-versa
  - [ ] Unit: password complexity enforcement; role→landing resolution

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
