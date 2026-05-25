# Story 19.4: Payment at POS (cash / M-Pesa STK / Paystack card / wallet)

Status: backlog

> Canonical ID: P2-E04-S04 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S04.md

## Story

As cashier,
I want to take any payment method without leaving the POS,
so that the capability described above is delivered.

## Acceptance Criteria

1. Pay screen offers all four methods.
2. Cash: change calculation, drawer instruction message.
3. M-Pesa STK: enter customer phone → push → live status panel.
4. Paystack: redirect customer's phone to a Paystack hosted-checkout URL (QR option) OR cashier-typed card form (Paystack-hosted).
5. Wallet: only if customer is a signed-in parent at the POS (phone lookup); deducts via wallet flow.
6. On success → receipt printed (default printer) + SMS-stub sent → stock decremented → cart cleared.
7. Failure paths handled distinctly.

## Tasks / Subtasks

- [ ] Task 1: Implement Payment at POS (cash / M-Pesa STK / Paystack card / wallet) (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] Satisfy AC#1: Pay screen offers all four methods.
  - [ ] Satisfy AC#2: Cash: change calculation, drawer instruction message.
  - [ ] Satisfy AC#3: M-Pesa STK: enter customer phone → push → live status panel.
  - [ ] Satisfy AC#4: Paystack: redirect customer's phone to a Paystack hosted-checkout URL (QR option) OR cashier-typed card form (Paystack-hosted).
  - [ ] Satisfy AC#5: Wallet: only if customer is a signed-in parent at the POS (phone lookup); deducts via wallet flow.
  - [ ] Satisfy AC#6: On success → receipt printed (default printer) + SMS-stub sent → stock decremented → cart cleared.
  - [ ] Satisfy AC#7: Failure paths handled distinctly.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Reuses P1-E04 adapters. Receipt via P1-E08. State machine logged.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S03 - P1-E04 - P1-E08
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
