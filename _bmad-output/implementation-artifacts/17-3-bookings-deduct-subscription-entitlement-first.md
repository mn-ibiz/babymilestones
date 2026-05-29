# Story 17.3: Bookings deduct subscription entitlement first

Status: done

> Canonical ID: P2-E02-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S03.md

## Story

As a parent on a subscription, my bookings should consume entitlement, not wallet.

## Acceptance Criteria

1. When booking a service, if parent has active subscription matching service + child + period, entitlement decrements by 1; no wallet charge.
2. If entitlement is exhausted, fall back to wallet pay-as-you-go.
3. Booking row records `paid_via='subscription'` or `paid_via='wallet'`.

## Tasks / Subtasks

- [x] Task 1: Implement Bookings deduct subscription entitlement first (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `bookSlot` finds a matching active sub (plan.serviceId == slot.serviceId, child, half-open period, entitlement>0), locks it FOR UPDATE, decrements, raises a settled 0-invoice — no wallet charge.
  - [x] Satisfy AC#2: no match / exhausted → wallet pending invoice at the service price (the prior flow).
  - [x] Satisfy AC#3: `bookings.paid_via` ('wallet'|'subscription', migration 0048) + `subscription_id`; cancel refunds the entitlement.
- [x] Task 2: Tests (AC: all)
  - [x] catalog (entitlement consume + exhaustion fallback + refund-on-cancel — 3). Concurrency safe (sub rows FOR UPDATE). Full suite green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E02-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E02.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `bookings.paid_via` + `subscription_id` (migration 0048). `bookSlot` consumes a matching active subscription's entitlement first (locked FOR UPDATE → race-safe across slots), else wallet pay-as-you-go.
- `cancelBooking` refunds the entitlement unit for a cancelled subscription booking.
- Loyalty/check-in note: slot-booking attendance check-in (epic 18) MUST treat a `paid_via='subscription'` booking as already-covered (skip the wallet debit) — its invoice is settled-0. Documented for 18-2.

### File List

- `packages/db/migrations/0048_booking_paid_via.sql`, `schema/bookings.ts` (paid_via + subscription_id)
- `packages/catalog/src/schedules.ts` (`bookSlot` entitlement branch + half-open period; `cancelBooking` refund)
- Tests: `schedules.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes (all 3 ACs met; concurrency verified safe) · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(Med) cancel didn't refund entitlement** — persisted `subscription_id` on the booking and refund the unit on cancel. **(Low) closed-interval period seam** — now half-open `[start, end)`. Concurrency: the subscription rows are locked `FOR UPDATE` in the same txn, so the last entitlement unit can't be double-spent across different slots.

Documented/deferred: slot-booking check-in (epic 18) must skip charging subscription bookings (settled-0 invoice — not a current code path); reschedule across periods rides the already-consumed unit (accepted for v1).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC3 (entitlement-first booking + wallet fallback + paid_via) + code-review (entitlement refund-on-cancel, half-open period). Full suite green. Status → done. | bmad-dev-story + code-review |
