# Story 16.6: Parent or Reception cancels a booking

Status: done

> Canonical ID: P2-E01-S06 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S06.md

## Story

As parent,
I want to cancel a booking I no longer need,
so that the capability described above is delivered.

## Acceptance Criteria

1. Cancel before cut-off → slot capacity restored, invoice voided.
2. Cancel after cut-off → admin discretion (reception flow); cancellation fee policy configurable per service (zero by default).
3. Audit logged.

## Tasks / Subtasks

- [x] Task 1: Implement Parent or Reception cancels a booking (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `bookings.status='cancelled'` frees the seat (capacity excludes cancelled); the pending invoice is voided (status='void', amount_due=0). Parent self-cancel allowed before the cut-off.
  - [x] Satisfy AC#2: after the cut-off the parent gets "contact reception" (409); reception can cancel any time and applies `services.cancellation_fee_cents` (default 0) as a new pending fee invoice.
  - [x] Satisfy AC#3: `booking.cancelled` audit with slot id, voided + fee invoice ids.
- [x] Task 2: Tests (AC: all)
  - [x] catalog `cancelBooking` (free seat, void, fee, double-cancel, re-book-after-cancel, reschedule-cancelled — 5); API parent + reception cancel. Full suite green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- Migration 0045: `bookings.status`, `services.cancellation_fee_cents`, invoices CHECK relaxed to allow `void`.
- `bookingCountsBySlot` excludes cancelled rows → capacity restored on cancel everywhere (book/browse/reschedule). This closes the cancellation concern deferred from 16-3/16-5.
- catalog `cancelBooking` (txn): status cancelled, void pending invoice (amount_due=0), optional pending fee invoice, audit.
- Parent route (before cut-off, free; else contact-reception 409) + reception route (any time, applies service fee).

### File List

- `packages/db/migrations/0045_booking_cancellation.sql`, `schema/bookings.ts` (status), `schema/services.ts` (fee)
- `packages/catalog/src/schedules.ts` (`cancelBooking`, `BookingAlreadyCancelledError`, count + duplicate-guard exclude cancelled, reschedule rejects cancelled), `services.ts`, `index.ts`
- `packages/contracts/src/index.ts` (cancellation fee on service schemas); `packages/auth/src/audit-actions.ts` (`booking.cancelled`)
- `apps/api/src/routes/parents/booking.ts` (cancel route), `reception/booking.ts` (cancel route), `admin/services.ts` (serializer)
- Outstanding-query fix: `parents/wallet.ts`, `reception/parent-profile.ts`, `reception/parents-search.ts` (exclude `void`)
- Tests: `schedules.test.ts`, `parents/booking.test.ts`, `reception/booking.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewer:** combined Blind+Edge+Acceptance.

Resolved: **(High) voided invoices leaked into the open-invoices list** — the four outstanding queries filtered `<> 'settled'` (which includes `void`); now `NOT IN ('settled','void')`. **(High) cancelled booking blocked re-book** — the (child, slot) duplicate guard (book + reschedule) now excludes cancelled rows, so a child can reclaim a slot they freed. **(Med) reschedule operated on a cancelled booking** — `rescheduleBooking` now rejects cancelled. Migration 0045 idempotency verified (FIFO top-up settlement filters `pending`, so void invoices are never settled).

Documented/deferred: a fee on an already-settled booking is an additional charge with no auto-refund (refund is the P1-E03-S06 path; `voidedInvoiceId=null` signals it); reception fee applies regardless of cut-off (admin discretion). The cancel UI surfaces with the 16-7 bookings list.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC3 (capacity-free + void + fee) + code-review (3 fixes incl. 2 HIGH). Full suite green. Status → done. | bmad-dev-story + code-review |
