# Story 4.2: M-Pesa C2B callback handler (idempotent)

Status: ready-for-dev

> Canonical ID: P1-E04-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S02.md

## Story

As the system,
I want to accept Daraja's callback exactly once, even if it arrives twice or out of order,
so that wallet top-ups are never double-credited or lost.

## Acceptance Criteria

1. Callback URL `POST /webhooks/mpesa/c2b`.
2. Handler is idempotent on `CheckoutRequestID`: `INSERT … ON CONFLICT DO NOTHING` into `mpesa_callback`.
3. Success → `wallet.post(topup)` via idempotency key = `mpesa_callback.id`.
4. Failure → state → `FAILED`, audit reason.
5. Out-of-order arrival (callback before Express response committed) handled — the callback creates the request row if it doesn't exist yet.
6. HTTP 200 OK returned in all cases (Daraja retries on non-200).

## Tasks / Subtasks

- [ ] Task 1: Add `mpesa_callback` table + migration in `packages/db` (AC: #2, #3)
  - [ ] Columns: `id` (PK, used as wallet idempotency key), `checkout_request_id`, raw payload, `result_code`, timestamps; unique constraint on `checkout_request_id`
  - [ ] Additive-only migration
- [ ] Task 2: Implement callback handler route in `apps/api` (AC: #1, #2, #6)
  - [ ] `apps/api/src/routes/webhooks/mpesa/c2b.ts`; `INSERT … ON CONFLICT DO NOTHING` into `mpesa_callback`; always return HTTP 200
  - [ ] Verify payload shape (treat as untrusted) and apply Daraja IP allowlist
- [ ] Task 3: Wire success path to wallet credit (AC: #3)
  - [ ] On `ResultCode == 0`, call `@bm/wallet` `wallet.post(topup)` with idempotency key = `mpesa_callback.id`; advance `mpesa_stk_request` state
- [ ] Task 4: Handle failure path (AC: #4)
  - [ ] On non-zero result, set `mpesa_stk_request` state `FAILED`; write reason to `audit_outbox`
- [ ] Task 5: Handle out-of-order arrival (AC: #5)
  - [ ] If no `mpesa_stk_request` exists for the `CheckoutRequestID`, create it from the callback before processing
- [ ] Task 6: Tests (AC: all)
  - [ ] Integration test: replay the same payload 5× → exactly 1 ledger entry; invalid/failure result → `FAILED` + audit; out-of-order callback creates request row; non-success paths still return 200 (vitest, test-first)

## Dev Notes

- Use Daraja's IP allowlist; verify the callback shape but treat the body as untrusted input.
- Idempotency is layered: DB unique on `mpesa_callback.checkout_request_id` (`ON CONFLICT DO NOTHING`) plus `wallet.post` idempotency key = `mpesa_callback.id`. Replays must produce no additional ledger entries.
- Always return HTTP 200 so Daraja stops retrying; failures are recorded internally, not surfaced as non-200.
- Callback route in `apps/api/src/routes/webhooks/`; wallet crediting via `packages/wallet`; tables in `packages/db`. Audited failures write to `audit_outbox`.

### Project Structure Notes
- New: `packages/db` table `mpesa_callback` + migration; `apps/api/src/routes/webhooks/mpesa/c2b.ts`.
- Reuses the `mpesa_stk_request` table and state machine from S01 and the `@bm/wallet` credit primitives.
- Depends on S01.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S02.md]
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
