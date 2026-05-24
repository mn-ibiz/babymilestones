# Story 1.5: Password / PIN reset by OTP

Status: ready-for-dev

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

- [ ] Task 1: Request reset code (AC: #1, #4, #5)
  - [ ] `apps/api/src/routes/auth/reset-request.ts` — normalise phone, generate code via `crypto.randomInt(100000, 999999)`, store with 10-min TTL + single-use flag (Redis)
  - [ ] Enqueue code to `sms_outbox` via `@bm/sms` (stub adapter at launch)
  - [ ] Rate-limit max 3 codes per phone per hour
  - [ ] Audit `auth.reset.requested` to `audit_outbox`
- [ ] Task 2: Verify code → reset token (AC: #2)
  - [ ] `apps/api/src/routes/auth/reset-verify.ts` — validate code (consume single-use), issue short-lived audience-bound JWT (15 min) as the reset token
- [ ] Task 3: Complete reset (AC: #3, #5)
  - [ ] `apps/api/src/routes/auth/reset-complete.ts` — verify reset token (audience + expiry), accept new PIN (reuse `@bm/auth` `pin.ts` weak-PIN + `argon2id`), persist hash
  - [ ] Invalidate all existing sessions for the user (Redis `DEL`)
  - [ ] Audit `auth.reset.completed` to `audit_outbox`
  - [ ] Register all three routes in `apps/api/src/app.ts` (buildApp)
- [ ] Task 4: Contracts (AC: #1, #2, #3)
  - [ ] Add reset request/verify/complete Zod schemas to `packages/contracts`
- [ ] Task 5: Tests per source DoD (AC: all)
  - [ ] Unit: code generation range, single-use consumption, weak-PIN reuse on new PIN
  - [ ] Integration: 10-min code expiry, JWT 15-min + audience binding, rate-limit at 4th request/hour, session invalidation after reset
  - [ ] Assert audit rows `auth.reset.requested` and `auth.reset.completed`

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
