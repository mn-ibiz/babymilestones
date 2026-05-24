# Story 4.5: Paystack webhook (signature + replay protection)

Status: ready-for-dev

> Canonical ID: P1-E04-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S05.md

## Story

As the system,
I want to trust Paystack webhooks cryptographically and accept each one only once,
so that wallet top-ups are credited securely and never replayed.

## Acceptance Criteria

1. `POST /webhooks/paystack` verifies `x-paystack-signature` via HMAC-SHA512 with secret; constant-time compare.
2. Invalid signature → 401, no DB writes.
3. `paystack_event.id UNIQUE`; replay → 200 OK, no work.
4. `charge.success` event → `wallet.post(topup)`.

## Tasks / Subtasks

- [ ] Task 1: Add `paystack_event` table + migration in `packages/db` (AC: #3)
  - [ ] Columns: `id` (UNIQUE, from Paystack event id), `event` type, raw payload, `reference`, timestamps
  - [ ] Additive-only migration
- [ ] Task 2: Implement signature verification in `packages/payments` (AC: #1, #2)
  - [ ] `packages/payments/src/paystack/verify.ts` — HMAC-SHA512 over raw body with secret; timing-safe (constant-time) compare
- [ ] Task 3: Implement webhook route in `apps/api` (AC: #1, #2, #3)
  - [ ] `apps/api/src/routes/webhooks/paystack.ts`; read raw body for HMAC; invalid signature → 401 with zero DB writes
  - [ ] Insert into `paystack_event` with UNIQUE id; replay → return 200, no further work
- [ ] Task 4: Wire `charge.success` to wallet credit (AC: #4)
  - [ ] On `charge.success`, call `@bm/wallet` `wallet.post(topup)` keyed by `paystack_event.id`; write audit to `audit_outbox`
- [ ] Task 5: Tests (AC: all)
  - [ ] Tampered payload rejected with 401 and no writes; valid replay returns 200 without re-posting to the ledger; `charge.success` credits exactly once (vitest, test-first)

## Dev Notes

- Signature verification lives in `packages/payments/paystack/verify.ts` using a timing-safe compare (e.g. `crypto.timingSafeEqual`). Verify HMAC-SHA512 over the raw request body — ensure the Fastify route preserves the raw body for the webhook path.
- Replay protection via `paystack_event.id UNIQUE`: a duplicate event must short-circuit to 200 OK with no ledger work. Crediting uses `packages/wallet` keyed by the event id so re-delivery cannot double-credit.
- This webhook is the authoritative credit path for S04's card top-ups.

### Project Structure Notes
- New: `packages/db` table `paystack_event` + migration; `packages/payments/src/paystack/verify.ts`; `apps/api/src/routes/webhooks/paystack.ts`.
- Reuses `@bm/wallet` credit primitives. Audited actions write to `audit_outbox`.
- Depends on S04.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
