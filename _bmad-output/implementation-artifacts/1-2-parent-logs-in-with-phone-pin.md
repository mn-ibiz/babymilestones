# Story 1.2: Parent logs in with phone + PIN

Status: ready-for-dev

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

- [ ] Task 1: Login route (AC: #1, #2, #4, #5)
  - [ ] `apps/api/src/routes/auth/login.ts` — accept phone + PIN, normalise phone via `@bm/auth` `phone.ts`
  - [ ] Constant-time PIN compare via `@bm/auth` `pin.ts`; perform a dummy hash compare on unknown phone so timing is identical (anti-enumeration)
  - [ ] On success: create session + set `bm_session` cookie (reuse `packages/auth/src/session.ts`), redirect to dashboard
  - [ ] On failure: return generic "Invalid credentials" (no field disclosure)
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
- [ ] Task 2: Rate limiting (AC: #3)
  - [ ] Rate limiter keyed by `(phone, ip)` — 5 failures in 5 min → HTTP 429 with `Retry-After`; counter fires at the 6th attempt
- [ ] Task 3: Audit (AC: #5)
  - [ ] Write `auth.login.success` / `auth.login.failure` to `audit_outbox`; ensure PIN never appears in payload or logs
- [ ] Task 4: Tests per source "Tests" section (AC: all)
  - [ ] Unit/integration: rate-limit fires at 6th attempt; timing-attack-safe compare (wrong PIN vs unknown phone)
  - [ ] Integration: success path, wrong PIN, 429 + `Retry-After`, anti-enumeration parity
  - [ ] Assert no PIN in audit payload

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
