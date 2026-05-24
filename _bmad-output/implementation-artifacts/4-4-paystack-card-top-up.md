# Story 4.4: Paystack card top-up

Status: ready-for-dev

> Canonical ID: P1-E04-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S04.md

## Story

As a parent,
I want to top up with my Visa or Mastercard via Paystack,
so that I can fund my wallet by card since Stripe isn't available in Kenya.

## Acceptance Criteria

1. "Pay with card" CTA opens Paystack hosted checkout with `email` (parent), `amount`, `reference` (UUID).
2. Successful charge redirects back; UI shows "verifying…".
3. Server verifies via `transaction/verify`; treats webhook as source of truth.
4. Card-on-file: optional checkbox; uses Paystack's saved authorization for repeat top-ups.

## Tasks / Subtasks

- [ ] Task 1: Implement Paystack adapter init + verify in `packages/payments` (AC: #1, #3, #4)
  - [ ] `packages/payments/src/paystack/init.ts` — initialize transaction with `email`, `amount`, `reference` (UUID); secret key from env (server-only)
  - [ ] `transaction/verify` call; support reusing saved authorization (card-on-file) for repeat top-ups
  - [ ] Conform to the unified Charge interface
- [ ] Task 2: Add init route in `apps/api` (AC: #1, #4)
  - [ ] `apps/api/src/routes/payments/paystack/init.ts`; generate UUID `reference`; persist initiation record; pass optional card-on-file flag
  - [ ] Write audit to `audit_outbox`
- [ ] Task 3: Add verify endpoint in `apps/api` (AC: #2, #3)
  - [ ] Endpoint hit on redirect-back; calls `transaction/verify`; webhook (S05) remains source of truth for crediting
- [ ] Task 4: Build card top-up UI in `apps/platform` (AC: #1, #2, #4)
  - [ ] "Pay with card" CTA → Paystack hosted checkout (public key in client); optional "save card" checkbox; "verifying…" state on redirect-back
- [ ] Task 5: Tests (AC: all)
  - [ ] Unit test adapter init/verify + reference generation; integration test init route + verify endpoint; saved-authorization repeat top-up path (vitest, test-first)

## Dev Notes

- Init route at `apps/api/src/routes/payments/paystack/init.ts`. Paystack public key lives in the client; the secret key is server-only (env).
- The webhook (S05) is the source of truth for crediting the wallet — `transaction/verify` here is for UX confirmation, not the authoritative credit. Actual `wallet.post(topup)` happens on the verified `charge.success` webhook.
- Adapter lives in `packages/payments` (paystack adapter, unified Charge interface). Card-on-file reuses Paystack's saved authorization token.

### Project Structure Notes
- New: `packages/payments/src/paystack/init.ts` (+ verify); `apps/api/src/routes/payments/paystack/init.ts` + verify endpoint; card top-up UI in `apps/platform/app/`.
- Reference UUID + amount validation schema in `packages/contracts`.
- Depends on P1-E03-S03 (parent wallet account); credit path completed by S05.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S04.md]
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
