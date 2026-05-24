# Story 1.1: Parent signs up with phone + PIN

Status: done

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

- [x] Task 1: Phone + PIN domain helpers in `@bm/auth` (AC: #1, #3, #4, #5)
  - [x] `packages/auth/src/phone.ts` — normalise to `+2547XXXXXXXX`, validate Kenya formats
  - [x] `packages/auth/src/pin.ts` — weak-PIN blocklist (`0000`,`1234`,`1111`,`2580`,`9999`), `argon2id` hash + verify; PIN never logged/echoed
  - [~] Shared signup Zod schema in `packages/contracts` — **deferred**: validation done in-route for now; promote to a shared `@bm/contracts` schema when the parent web form (E11/E12) consumes it.
- [x] Task 2: Session creation primitive (AC: #1)
  - [x] `packages/auth/src/session.ts` — opaque token + `bm_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, domain `.babymilestones.co.ke`) via `serializeSessionCookie`. **Store:** `InMemorySessionStore` behind a `SessionStore` interface; **Redis impl deferred to 1-4 (SSO)**.
- [x] Task 3: Signup route (AC: #1, #2, #3, #4, #6)
  - [x] `apps/api/src/routes/auth/signup.ts` — validate, reject duplicate phone (friendly login redirect, no leak; unique-violation race handled), create `users` row, provision wallet, create session
  - [x] Registered in `apps/api/src/app.ts` (buildApp) via `routes/auth/index.ts`
  - [x] `auth.signup` row to `audit_outbox` (`actor`=user_id, `ip`, `user_agent`, `created_at`)
- [x] Task 4: Wallet auto-provision on signup (AC: #1)
  - [x] `wallets` row created inside the signup transaction (atomic with user + audit). NB: provisioning = create the wallet record here; `@bm/wallet` ledger primitives land in P1-E03.
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Unit (`@bm/auth`): phone normalisation, weak-PIN list, argon2id hash/verify roundtrip (test-first)
  - [x] Integration (`apps/api`, PGlite): happy path (+ wallet + audit + resolvable session), duplicate phone, invalid format, weak PIN, PIN mismatch
  - [~] E2E `e2e/signup-flow.spec.ts` — **deferred**: no Playwright harness yet (lands with X8 CI/CD); integration tests cover all six ACs.

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

claude-opus-4-7 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- Auth unit tests (phone/pin) + signup integration tests written test-first → green.
- Full gate green: test/typecheck/lint (14/14), build (5/5).
- Review pass (subagent) → fixed: narrowed the duplicate `catch` to unique-violation only (was masking all TX errors as 409); added test asserting the session token resolves to the user; asserted full AC6 payload (actor/ip/user_agent/created_at).

### Completion Notes List

- ✅ All six ACs implemented and covered by tests.
- Deviations from the dev-ready guess (recorded honestly): (1) `users` + `wallets` tables created here (migration 0002) since none existed; (2) sessions use an in-memory store behind a `SessionStore` interface — **Redis wiring deferred to 1-4**; (3) signup validation is in-route — **shared `@bm/contracts` Zod schema deferred** to the web-form story; (4) **E2E deferred** until the Playwright harness lands (X8). None affect AC coverage.
- `trustProxy` must be enabled in prod so `req.ip` (AC6) records the client, not the LB — follow-up for the deploy/observability epic.

### File List

- `packages/auth/src/phone.ts`, `pin.ts`, `session.ts` (new) + `index.ts` (rewritten)
- `packages/auth/src/phone.test.ts`, `pin.test.ts` (new); removed placeholder `index.test.ts`
- `packages/auth/package.json` (modified) — `@node-rs/argon2` dep
- `packages/db/src/schema/users.ts`, `wallets.ts`, `client.ts` (new); `schema/index.ts`, `index.ts`, `audit.ts` (modified)
- `packages/db/migrations/0002_users_wallets.sql` (new)
- `apps/api/src/app.ts` (modified) — deps-injected buildApp
- `apps/api/src/routes/auth/index.ts`, `signup.ts`, `signup.test.ts` (new)
- `apps/api/package.json` (modified) — `@bm/db`, `drizzle-orm` deps

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented test-first; reviewed + fixes applied; all ACs green; status → done | bmad-dev-story |
