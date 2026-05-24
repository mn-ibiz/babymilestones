# Story 1.1: Parent signs up with phone + PIN

Status: ready-for-dev

> Canonical ID: P1-E01-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S01.md

## Story

As a new parent,
I want to register with my phone number and a 4-digit PIN,
so that I can access Baby Milestones without juggling passwords.

## Acceptance Criteria

1. Valid Kenya phone (`+2547XXXXXXXX` / `07XXXXXXXX`) + matching 4-digit PIN entered twice → account created, auto-logged in, wallet auto-provisioned.
2. Duplicate phone → redirect to login with friendly message; no account leak.
3. Invalid phone format → inline field error; submit blocked.
4. Weak PINs (`0000`, `1234`, `1111`, `2580`, `9999`) rejected with helper text.
5. PIN stored as `argon2id` hash; never logged or echoed.
6. `audit_outbox` row written: `auth.signup`, `user_id`, `ip`, `user_agent`, `timestamp`.

## Tasks / Subtasks

- [ ] Task 1: Phone + PIN domain helpers in `@bm/auth` (AC: #1, #3, #4, #5)
  - [ ] `packages/auth/src/phone.ts` — normalise to `+2547XXXXXXXX`, validate Kenya formats
  - [ ] `packages/auth/src/pin.ts` — weak-PIN blocklist (`0000`,`1234`,`1111`,`2580`,`9999`), `argon2id` hash + verify; ensure PIN is never logged/echoed
  - [ ] Add shared signup Zod schema in `packages/contracts` (phone, pin, pin_confirm)
- [ ] Task 2: Session creation primitive (AC: #1)
  - [ ] `packages/auth/src/session.ts` — create opaque token, store in Redis; emit `bm_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, domain `.babymilestones.co.ke`)
- [ ] Task 3: Signup route (AC: #1, #2, #3, #4, #6)
  - [ ] `apps/api/src/routes/auth/signup.ts` — validate, reject duplicate phone (friendly login redirect, no leak), create `users` row, auto-provision wallet, create session
  - [ ] Register route in `apps/api/src/app.ts` (buildApp) under `routes/auth`
  - [ ] Write `audit.signup` row to `audit_outbox` (`user_id`, `ip`, `user_agent`, `timestamp`)
- [ ] Task 4: Wallet auto-provision on signup (AC: #1)
  - [ ] Call `@bm/wallet` to create the parent wallet within the signup transaction
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: phone normalisation, weak-PIN list, hash deterministic verify (vitest, test-first)
  - [ ] Integration: happy path, duplicate phone, invalid format, weak PIN
  - [ ] E2E: `e2e/signup-flow.spec.ts`

## Dev Notes

- Phone normalised to `+2547XXXXXXXX`; PIN hashed with `argon2id`; PIN must never be logged or echoed.
- Session is created immediately on signup: opaque token in Redis, cookie `bm_session`, domain `.babymilestones.co.ke`, `HttpOnly`, `Secure`, `SameSite=Lax`.
- Source paths to touch: `apps/api/src/routes/auth/signup.ts`, `packages/auth/src/{phone.ts,pin.ts,session.ts}`, `packages/contracts` (signup schema), `@bm/wallet` for provisioning.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor). Cover phone normalisation, weak-PIN list, deterministic hash verify (unit), the four integration paths, and the `e2e/signup-flow.spec.ts` flow.

### Project Structure Notes
- New/changed in `packages/auth` (phone, pin, session), `packages/contracts` (signup schema), `apps/api/src/routes/auth/signup.ts` wired into `buildApp`.
- Wallet provisioning depends on `@bm/wallet`.
- Dependencies (from source): `users` table migrated; `audit_outbox` ready. Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S01.md]
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
