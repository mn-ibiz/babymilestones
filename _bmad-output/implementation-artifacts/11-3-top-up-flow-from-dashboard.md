# Story 11.3: Top-up flow from dashboard

Status: ready-for-dev

> Canonical ID: P1-E11-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S03.md

## Story

As a parent,
I want to top up via the dashboard without going to Reception,
so that I can fund my wallet from my phone using M-Pesa, card, or bank transfer.

## Acceptance Criteria

1. M-Pesa STK: enter amount → tap "Pay" → STK push to phone → live status → success state with new balance.
2. Paystack card: redirect to hosted checkout → return → verifying → success.
3. Bank transfer: instructions screen ("Send to X account; admin will confirm").
4. Failures show clear remediation copy.

## Tasks / Subtasks

- [ ] Task 1: Top-up charge API in `apps/api` (AC: #1, #2, #3, #4)
  - [ ] Add routes `apps/api/src/routes/topup.ts` (registered via `apps/api/src/app.ts`) using `@bm/payments` unified Charge interface (`mpesa`, `paystack`, `cash`/bank adapters)
  - [ ] M-Pesa STK: initiate push, expose status polling; on confirmation credit wallet via `@bm/wallet` (idempotent)
  - [ ] Paystack: initialize hosted checkout, handle return + verify; credit wallet on success
  - [ ] Bank transfer: return instructions payload (manual admin confirmation path)
  - [ ] Map provider errors to clear remediation messages
- [ ] Task 2: Top-up UI flow in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [ ] Method picker (entry from Wallet page, P1-E11-S01) under `apps/platform/app/(app)/wallet/topup/`
  - [ ] M-Pesa: amount entry → "Pay" → live status → success with new balance
  - [ ] Paystack: redirect to hosted checkout → return → verifying → success
  - [ ] Bank transfer: instructions screen
  - [ ] Failure states with remediation copy across all methods
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: M-Pesa STK happy path + live status + balance update; Paystack redirect/return/verify; bank instructions render; failure remediation copy; wallet credit idempotency. Use vitest, test-first.

## Dev Notes

- Charge logic in `apps/api` via `@bm/payments` (adapters `mpesa`, `paystack`, `cash`; unified Charge interface) and `@bm/wallet` for crediting (idempotency required). UI in `apps/platform` authed route group, mobile-first, using `packages/ui`.
- Webhook/return handling lives in `apps/api` (single API surface owns webhooks). Wallet credit must be idempotent against provider callbacks.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/topup.ts` (+ provider webhook routes), `apps/platform/app/(app)/wallet/topup/`. Reuses `@bm/payments` and `@bm/wallet`.
- Depends on P1-E04 (payments) per source Dependencies. Entry point is the Wallet page (P1-E11-S01).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
