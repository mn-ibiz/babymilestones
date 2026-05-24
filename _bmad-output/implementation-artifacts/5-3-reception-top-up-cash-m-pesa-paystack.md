# Story 5.3: Reception top-up (cash / M-Pesa / Paystack)

Status: ready-for-dev

> Canonical ID: P1-E05-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S03.md

## Story

As Reception,
I want to take a top-up from a parent in any payment method,
so that I can credit their wallet however they choose to pay.

## Acceptance Criteria

1. "Top up" CTA opens a sheet: amount field, method picker (Cash / M-Pesa STK / Paystack card / Bank transfer).
2. M-Pesa STK triggers parent's phone — Reception sees status updating live.
3. Cash route prints receipt immediately.
4. Audit logged with method.

## Tasks / Subtasks

- [ ] Task 1: Top-up contract (AC: #1, #4)
  - [ ] Add top-up Zod schema in `packages/contracts` (amount, method ∈ cash | mpesa_stk | paystack_card | bank_transfer, parent_id)
- [ ] Task 2: Top-up route via payments adapters (AC: #1, #2, #4)
  - [ ] `apps/api/src/routes/reception/topup.ts` — dispatch to `@bm/payments` adapter per method (`cash`, `mpesa`, `paystack`); credit wallet via `@bm/wallet` on success (idempotent)
  - [ ] M-Pesa STK: initiate STK push to parent phone; rely on `mpesa_*` webhook to confirm and credit
  - [ ] Register route in `apps/api/src/app.ts` (buildApp); write `audit_outbox` row including `method`
- [ ] Task 3: Live status for STK (AC: #2)
  - [ ] Expose top-up status endpoint (pending/success/failed) keyed by transaction; UI polls/subscribes for live updates
- [ ] Task 4: Cash immediate receipt (AC: #3)
  - [ ] Cash path credits wallet synchronously and triggers immediate receipt (hand off to receipt flow per P1-E05-S06)
- [ ] Task 5: Top-up sheet UI (AC: #1, #2, #3)
  - [ ] `apps/admin` Reception — "Top up" CTA → sheet with amount + method picker; show live STK status; cash prints receipt immediately
- [ ] Task 6: Tests per source "Tests" section (AC: all)
  - [ ] Unit: method dispatch routing, idempotent wallet credit (vitest, test-first)
  - [ ] Integration: each method path; STK pending→success via webhook; audit row carries method
  - [ ] E2E: open sheet, cash top-up credits + prints; STK shows live status

## Dev Notes

- Use the unified Charge interface in `@bm/payments` (adapters `cash`, `mpesa`, `paystack`); do not call providers directly from the route.
- M-Pesa is async: route initiates STK, confirmation arrives via the `mpesa_*` webhook which credits the wallet — keep the wallet credit idempotent.
- Cash settles synchronously and prints immediately (receipt per P1-E05-S06).
- Every top-up writes an `audit_outbox` row including the payment method.
- Source paths to touch: `apps/api/src/routes/reception/topup.ts`, `apps/admin` Reception top-up sheet, `packages/contracts` (top-up schema), `@bm/payments`, `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI sheet in `apps/admin`; ledger via `packages/wallet`; provider adapters in `packages/payments`.
- Dependencies (from source): S01, S02, P1-E04 (payments adapters). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
