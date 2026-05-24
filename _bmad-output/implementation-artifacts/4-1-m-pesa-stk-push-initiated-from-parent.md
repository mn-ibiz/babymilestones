# Story 4.1: M-Pesa STK push initiated from parent dashboard

Status: ready-for-dev

> Canonical ID: P1-E04-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S01.md

## Story

As a parent,
I want to top up by entering an amount and tapping "Pay", then approving on my phone,
so that I can fund my wallet via M-Pesa without leaving the dashboard.

## Acceptance Criteria

1. Top-up form: amount (KES, min 50, max 70,000 per STK call), confirm button.
2. Server calls Daraja `stkpush`; persists `mpesa_stk_request` row keyed by `CheckoutRequestID`.
3. UI shows "Check your phone…" with a 90-second progress indicator.
4. Polling endpoint returns current status; transitions reflected live.
5. Audit logged.

## Tasks / Subtasks

- [ ] Task 1: Add `mpesa_stk_request` table + migration in `packages/db` (AC: #2)
  - [ ] Drizzle schema: columns for `checkout_request_id` (unique), `merchant_request_id`, `parent_id`, `amount`, `state`, timestamps; state machine `INITIATED → STK_SENT → CALLBACK_PENDING`
  - [ ] Additive-only migration under `packages/db/migrations`
- [ ] Task 2: Implement M-Pesa adapter STK init in `packages/payments` (AC: #2)
  - [ ] `packages/payments/src/mpesa/stkPush.ts` — wrap Daraja `stkpush`; read Daraja credentials from env only (never DB)
  - [ ] Conform to the unified Charge interface; map to `mpesa_stk_request` state `STK_SENT`
- [ ] Task 3: Add init route in `apps/api` (AC: #1, #2, #5)
  - [ ] `apps/api/src/routes/payments/mpesa/initiate.ts`; validate amount via `@bm/contracts` Zod (min 50, max 70,000)
  - [ ] Persist `mpesa_stk_request` keyed by `CheckoutRequestID`; write audit to `audit_outbox`
- [ ] Task 4: Add status polling endpoint in `apps/api` (AC: #4)
  - [ ] Returns current `mpesa_stk_request.state` for the parent's request
- [ ] Task 5: Build top-up UI in `apps/platform` (AC: #1, #3, #4)
  - [ ] Form (amount + confirm) in parent dashboard; "Check your phone…" 90s progress indicator; poll status endpoint, reflect transitions live
- [ ] Task 6: Tests (AC: all)
  - [ ] Unit test STK init adapter + amount validation; integration test for route persisting `mpesa_stk_request` and audit write; UI/polling test for live status transitions (vitest, test-first)

## Dev Notes

- Daraja credentials live in env vars only, never in the DB. Init route at `apps/api/src/routes/payments/mpesa/initiate.ts`.
- State machine for this story: `INITIATED → STK_SENT` (callback handling is S02; `CALLBACK_PENDING` consumed by the S03 cron).
- Adapter lives in `packages/payments` (mpesa adapter, unified Charge interface). DB table `mpesa_stk_request` keyed by `CheckoutRequestID` lives in `packages/db`. Wallet crediting happens later in S02 via `packages/wallet` — this story only initiates.
- Audited actions must write to `audit_outbox`.

### Project Structure Notes
- New: `packages/db` table `mpesa_stk_request` + migration; `packages/payments/src/mpesa/stkPush.ts`; `apps/api/src/routes/payments/mpesa/initiate.ts` + status polling route; top-up form in `apps/platform/app/`.
- Amount validation schema in `packages/contracts`.
- Depends on P1-E03-S03 (parent wallet account).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S01.md]
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
