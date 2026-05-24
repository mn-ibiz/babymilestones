# Story 1.5: Password / PIN reset by OTP

Status: done

> Canonical ID: P1-E01-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S05.md

## Story

As a parent who forgot their PIN,
I want to reset it via an SMS code,
so that I'm not locked out.

## Acceptance Criteria

1. Request reset by phone → 6-digit code, valid 10 min, single-use, logged to `sms_outbox` (stub).
2. Code-verify endpoint → 1-time short-lived reset token (JWT, 15 min, audience-bound).
3. Reset endpoint accepts token + new PIN; old sessions invalidated.
4. Rate-limit: max 3 reset codes per phone per hour.
5. Audit: `auth.reset.requested`, `auth.reset.completed`.

## Tasks / Subtasks

- [x] Task 1: Request reset code (AC: #1, #4, #5)
  - [x] `apps/api/src/routes/auth/reset-request.ts` — normalise phone, generate code via `crypto.randomInt(100000, 1000000)`, store hashed in `otp_codes` with 10-min TTL + `consumed_at` single-use flag
  - [x] Deliver code to `sms_outbox` via `@bm/sms` `StubSmsSender` (stub adapter at launch)
  - [x] Rate-limit max 3 codes per phone per hour (`ResetRateLimiter`)
  - [x] Audit `auth.reset.requested` to `audit_outbox`
- [x] Task 2: Verify code → reset token (AC: #2)
  - [x] `apps/api/src/routes/auth/reset-verify.ts` — validate code (consume single-use), issue short-lived audience-bound token (15 min). [~] Used an in-house HMAC-SHA256 signed token (`@bm/auth` `reset-token.ts`) instead of a JWT library — no `jose`/`jsonwebtoken` dep in the repo; same audience + expiry + tamper-evidence guarantees, plus jti-based single-use.
- [x] Task 3: Complete reset (AC: #3, #5)
  - [x] `apps/api/src/routes/auth/reset-complete.ts` — verify reset token (signature + audience + expiry + single-use jti), accept new PIN (reuse `@bm/auth` `pin.ts` weak-PIN + `argon2id`), persist hash
  - [x] Invalidate all existing sessions for the user (`sessions.destroyAllForUser`, prod Redis `DEL`)
  - [x] Audit `auth.reset.completed` to `audit_outbox`
  - [x] Register all three routes via `registerAuthRoutes` (wired in `apps/api/src/app.ts` buildApp)
- [x] Task 4: Contracts (AC: #1, #2, #3)
  - [x] Added reset request/verify/complete Zod schemas to `packages/contracts`
- [x] Task 5: Tests per source DoD (AC: all)
  - [x] Unit: code generation range, single-use jti consumption, token TTL/audience/signature
  - [x] Integration: 10-min code expiry, token 15-min + audience binding, rate-limit at 4th request/hour, session invalidation after reset, weak-PIN reject without burning token, token replay rejected, anti-enumeration
  - [x] Assert audit rows `auth.reset.requested` and `auth.reset.completed`; assert OTP/PIN never appear in payloads

## Dev Notes

- Codes generated with `crypto.randomInt(100000, 999999)`, 10-min TTL, single-use. Verify step mints a 1-time, audience-bound JWT (15 min) used by the reset step. Completing a reset invalidates the user's old sessions.
- Staff reset is admin-initiated (no self-serve) — out of scope for this story's self-serve flow.
- SMS goes through `@bm/sms` to `sms_outbox`; the launch adapter is a stub.
- Source paths to touch: `apps/api/src/routes/auth/` (reset-request / reset-verify / reset-complete), `@bm/auth` `pin.ts` + session invalidation, `@bm/sms`, `packages/contracts`.
- Testing standards: vitest, TS strict, test-first. Cover expiry, single-use, rate-limit boundary, and session invalidation.

### Project Structure Notes
- New reset routes under `apps/api/src/routes/auth/`; reuses `@bm/auth` PIN + session primitives and `@bm/sms` stub.
- Dependencies (from source): S01 (parent account + PIN primitives) and P1-E09 (SMS stub).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (37 api tests + auth/sms unit suites), `pnpm typecheck`, `pnpm lint`, `pnpm build` — all passing.

### Completion Notes List

- OTP codes stored hashed (SHA-256) in new `otp_codes` table; raw code is only ever in the `sms_outbox` body (stub delivery channel), never in logs or audit payloads.
- Reset token is an in-house HMAC-SHA256 signed token (no JWT dep in the repo). Audience-bound (`pin-reset`), 15-min TTL, and single-use via a `jti` recorded in `InMemoryConsumedTokenStore` (prod → Redis alongside sessions).
- AC4 rate-limit is per-phone (not per-IP) so it can't be bypassed by rotating IPs; 3/hour, 4th → 429 with `Retry-After`.
- Anti-enumeration: `reset/request` returns the same generic 200 for known and unknown phones, minting a code only for real accounts.
- Weak/malformed new PIN is rejected before the token is redeemed, so a bad PIN does not burn the single-use token.
- Successful reset hashes the new PIN (argon2id via `@bm/auth` `hashPin`) and calls `destroyAllForUser` to invalidate every existing session.
- `now` clock is injectable through `buildApp` so TTL/expiry are tested deterministically.

### File List

- packages/db/src/schema/otp.ts (new)
- packages/db/src/schema/sms.ts (new)
- packages/db/src/schema/index.ts (export new tables)
- packages/db/migrations/0004_otp_sms_outbox.sql (new, additive)
- packages/sms/src/index.ts (StubSmsSender)
- packages/sms/src/index.test.ts
- packages/sms/package.json (+@bm/db, drizzle-orm deps)
- packages/auth/src/otp.ts (new) + otp.test.ts
- packages/auth/src/reset-token.ts (new) + reset-token.test.ts
- packages/auth/src/reset-rate-limit.ts (new) + reset-rate-limit.test.ts
- packages/auth/src/index.ts (exports)
- packages/contracts/src/index.ts (reset Zod schemas)
- apps/api/src/routes/auth/reset-request.ts (new)
- apps/api/src/routes/auth/reset-verify.ts (new)
- apps/api/src/routes/auth/reset-complete.ts (new)
- apps/api/src/routes/auth/reset.test.ts (new)
- apps/api/src/routes/auth/index.ts (wire routes + deps)
- apps/api/src/app.ts (default reset deps)
- apps/api/package.json (+@bm/sms dep)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented PIN reset by OTP (request/verify/complete), OTP + sms_outbox tables, SMS stub sender, audience-bound single-use reset token, per-phone rate-limit, session invalidation, full test coverage | claude-opus-4-7 |
