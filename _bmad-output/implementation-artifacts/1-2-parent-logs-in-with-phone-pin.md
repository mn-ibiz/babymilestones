# Story 1.2: Parent logs in with phone + PIN

Status: done

> Canonical ID: P1-E01-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S02.md

## Story

As a returning parent,
I want to log in with my phone and PIN,
so that I can access my wallet.

## Acceptance Criteria

1. Correct phone + PIN → session cookie set, redirect to dashboard.
2. Wrong PIN → "Invalid credentials" (never specify which field).
3. 5 failed attempts in 5 min → rate-limited (HTTP 429) with `Retry-After`.
4. Unknown phone → identical timing and error as wrong PIN (anti-enumeration).
5. `audit_outbox`: `auth.login.success` or `auth.login.failure` (no PIN in payload).

## Tasks / Subtasks

- [x] Task 1: Login route (AC: #1, #2, #4, #5)
  - [x] `apps/api/src/routes/auth/login.ts` — accept phone + PIN, normalise phone via `@bm/auth` `phone.ts`
  - [x] PIN verify via `@bm/auth` `pin.ts`; dummy-hash compare (`DUMMY_PIN_HASH`) on unknown phone so timing/response match (anti-enumeration)
  - [x] On success: create session + set `bm_session` cookie (reuse `packages/auth/src/session.ts`), return `{ redirect: "/dashboard" }`
  - [x] On failure: return generic "Invalid credentials" (no field disclosure)
  - [x] Register route via `apps/api/src/routes/auth/index.ts` wired in `buildApp` (`app.ts`)
- [x] Task 2: Rate limiting (AC: #3)
  - [x] `LoginRateLimiter` in `@bm/auth` keyed by `(phone, ip)` — 5 failures in 5 min → HTTP 429 with `Retry-After`; blocks at the 6th attempt. In-memory; Redis deferred to S04 (noted in file + review findings).
- [x] Task 3: Audit (AC: #5)
  - [x] Write `auth.login.success` / `auth.login.failure` to `audit_outbox`; payload is `{ ip, user_agent }` only — PIN never present
- [x] Task 4: Tests per source "Tests" section (AC: all)
  - [x] Unit: rate-limit blocks at 6th attempt, per-(phone,ip) keying, window expiry, reset
  - [x] Integration: success path, wrong PIN, 429 + `Retry-After`, anti-enumeration parity, invalid-format 400
  - [x] Assert no PIN in audit payload

## Dev Notes

- Rate limiter keyed by `(phone, ip)`. Constant-time PIN compare; unknown phone must run an equivalent compare path so response timing and error message match a wrong PIN.
- Source path to touch: `apps/api/src/routes/auth/login.ts`; reuse `packages/auth/src/{phone.ts,pin.ts,session.ts}`.
- Cookie/session machinery identical to signup (S01): opaque token in Redis, `bm_session` cookie on `.babymilestones.co.ke`.
- Testing standards: vitest, TS strict, test-first. Verify rate-limit boundary (6th attempt) and timing-attack safety per source "Tests".

### Project Structure Notes
- Changes concentrated in `apps/api/src/routes/auth/login.ts` and the existing `@bm/auth` primitives.
- Dependency (from source): S01 (signup, session + phone/pin primitives, `users`, `audit_outbox`).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

`pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green from repo root. 12 API tests + 22 `@bm/auth` tests pass. No migrations needed (reuses `users`, `wallets`, `audit_outbox` from S01/X5-S01).

### Completion Notes List

- Added `LoginRateLimiter` (in-memory, `(phone, ip)`, 5 failures / 5 min, blocks at 6th) to `@bm/auth`. Redis-backed sharing deferred to P1-E01-S04 — noted in file header and review findings (L1/L2).
- Anti-enumeration (AC4): unknown phone runs `verifyPin` against a fixed, pre-computed `DUMMY_PIN_HASH` so the argon2 cost (and thus timing + the generic 401) matches a wrong-PIN attempt.
- AC2: single generic `{ error: "Invalid credentials" }` body for both wrong PIN and unknown phone — no field disclosure.
- AC5: `auth.login.success` / `auth.login.failure` written via the existing `audit()` outbox helper; payload is `{ ip, user_agent }` only — the raw PIN is never in payload or logs. Tests assert the submitted PIN string is absent from the audit payload.
- AC3: 429 carries a `Retry-After` header (seconds to window reset) and blocks even a correct PIN while limited; a successful login clears the counter.
- Malformed phone is a 400 (not a credential failure) and does not consume a rate-limit slot or write an audit row.

### File List

- `packages/auth/src/rate-limit.ts` (new)
- `packages/auth/src/rate-limit.test.ts` (new)
- `packages/auth/src/pin.ts` (added `DUMMY_PIN_HASH`)
- `packages/auth/src/index.ts` (exports `LoginRateLimiter`, `RateLimitResult`, `DUMMY_PIN_HASH`)
- `apps/api/src/routes/auth/login.ts` (new)
- `apps/api/src/routes/auth/login.test.ts` (new)
- `apps/api/src/routes/auth/index.ts` (register login, add `rateLimiter` to `AuthDeps`)
- `apps/api/src/app.ts` (wire `rateLimiter` into `buildApp`, default in-memory)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented login route, rate limiter, anti-enumeration, audit; full gate green; reviewed | claude-opus-4-7 |
