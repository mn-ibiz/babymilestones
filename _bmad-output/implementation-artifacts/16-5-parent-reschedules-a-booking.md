# Story 16.5: Parent reschedules a booking

Status: done

> Canonical ID: P2-E01-S05 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S05.md

## Story

As parent,
I want to move a booking if life gets in the way, up to the cut-off,
so that the capability described above is delivered.

## Acceptance Criteria

1. Reschedule allowed up to N hours before slot (configurable per service; default 2).
2. New slot must have capacity; new booking replaces old in one transaction.
3. Audit shows both old and new slot IDs.
4. After cut-off, parent gets a clear "Contact reception" message instead.

## Tasks / Subtasks

- [x] Task 1: Implement Parent reschedules a booking (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: per-service `reschedule_cutoff_hours` (default 2, migration 0044); `isWithinRescheduleCutoff` against the OLD slot's start.
  - [x] Satisfy AC#2: `rescheduleBooking` locks the new slot, checks same-service + capacity + duplicate-child, repoints `slot_id` in one transaction (invoice/price unchanged).
  - [x] Satisfy AC#3: `booking.rescheduled` audit carries `old_slot_id` + `new_slot_id`.
  - [x] Satisfy AC#4: past the cut-off → 409 "Too late to reschedule online — please contact reception". (Reschedule UI lands with the 16-7 bookings list.)
- [x] Task 2: Tests (AC: all)
  - [x] catalog (cut-off helper, move/capacity/mismatch — 4); API integration (reschedule happy / cut-off / same-slot / ownership). Full suite green.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `services.reschedule_cutoff_hours` (migration 0044, NOT NULL default 2; idempotent re-run verified) + on service create/update contracts/catalog + admin serializer.
- catalog `rescheduleBooking` (locks new slot FOR UPDATE; same-service, capacity, duplicate-child checks; repoints `slot_id`; audits both ids — pending invoice untouched) + `isWithinRescheduleCutoff`/`slotStartUtcMs`.
- Route `POST /parents/me/bookings/:bookingId/reschedule` — ownership, cut-off (AC4 message), same-slot/past-slot guards, error→status mapping.
- Reschedule UI deferred to 16-7 (bookings list with actions); backend independently complete + reachable.

### File List

- `packages/db/migrations/0044_service_reschedule_cutoff.sql`, `packages/db/src/schema/services.ts`
- `packages/catalog/src/schedules.ts` (`rescheduleBooking`, cut-off helpers, `BookingNotFoundError`/`ServiceMismatchError`), `services.ts` (cutoff field), `index.ts`
- `packages/contracts/src/index.ts` (`rescheduleBookingSchema`, cutoff on service schemas)
- `packages/auth/src/audit-actions.ts` (`booking.rescheduled`)
- `apps/api/src/routes/parents/booking.ts` (reschedule route); `apps/api/src/routes/admin/services.ts` (serializer)
- Tests: `schedules.test.ts`, `parents/booking.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved (all 4 ACs FULLY met, no blocking defects) · **Reviewer:** combined Blind+Edge+Acceptance.

Verified: atomic + race-safe move (new slot `FOR UPDATE`; the moving booking is correctly excluded from the new-slot count; old slot needn't be locked since a reschedule only frees a seat); migration 0044 idempotent; optional cutoff field doesn't break existing service tests; backend reachable. Added a same-slot 409 coverage test.

Dismissed (LOW / pre-existing): UTC-vs-EAT cut-off (system-wide convention); cut-off TOCTOU (negligible window); internal-vs-route past-slot guard (route enforces it); inactive-service reschedule (retiring already withdraws future slots). Forward note: cancellation (16-6) must clear `slot_id` (or the count must exclude cancelled) so reschedule/capacity stay correct.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC4 (cut-off + atomic move + audit) + code-review. Full suite green. Status → done. | bmad-dev-story + code-review |
