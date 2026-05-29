# Story 16.3: Parent books a slot (creates pending invoice)

Status: done

> Canonical ID: P2-E01-S03 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S03.md

## Story

As parent,
I want to book a slot and lock my child's seat instantly,
so that the capability described above is delivered.

## Acceptance Criteria

1. Tap slot → child picker (parent's eligible children only) → confirm.
2. Booking row created; `session_slots.bookings_in_slot` incremented atomically.
3. Pending invoice created for the service price at booking time (price snapshotted).
4. Capacity race: two parents booking the last seat — only one succeeds; the other sees a clear "Slot just filled" message.
5. SMS-stub confirmation sent with date/time and child name.

## Tasks / Subtasks

- [x] Task 1: Implement Parent books a slot (creates pending invoice) (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: browse page slots are tappable → confirm panel → POST; eligibility enforced (422). Ineligible child shows the age notice.
  - [x] Satisfy AC#2: booking row created; occupancy is computed from `bookings.slot_id` (no stored counter) and incremented atomically by the insert inside a `FOR UPDATE`-locked transaction.
  - [x] Satisfy AC#3: pending invoice at the effective service price (`resolveServicePriceAt` at slot date), snapshotted onto invoice + booking.
  - [x] Satisfy AC#4: slot row lock serializes racers; the loser gets `SlotFullError` → 409 "Slot just filled" surfaced in the UI.
  - [x] Satisfy AC#5: SMS-stub `booking.confirmed` (child name + date + time) via the stub sender.
  - [x] Touch / create: `@bm/catalog bookSlot`, `apps/api/src/routes/parents/booking.ts` (URL `POST /parents/me/bookings`), platform book interaction.
- [x] Task 2: Tests (AC: all)
  - [x] catalog `bookSlot` (snapshot, full, no-price, duplicate, atomic audit — 5), API integration (7). Full suite green; platform `next build` verified.

## Dev Notes

Atomic `UPDATE … SET bookings_in_slot = bookings_in_slot + 1 WHERE remaining > 0`. Files: `apps/api/src/routes/bookings/create.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story + bmad-code-review)

### Completion Notes List

- `bookSlot` (catalog) runs in a transaction that locks the slot row (`SELECT … FOR UPDATE`), then checks one-seat-per-child (duplicate guard), capacity, resolves + snapshots the price, inserts the pending invoice + booking, and writes the `booking.created` audit — all atomic (AC2/AC3/AC5).
- Route `POST /parents/me/bookings` (parent group): ownership + not-archived child, active service, past-slot guard, age eligibility (422), then `bookSlot`; maps SlotFull→409 "Slot just filled", Duplicate→409, NoPrice→409, NotFound→404. SMS-stub confirmation sent post-commit (swallow-and-log).
- Browse page: available slots are buttons → confirm panel → booking; success/error (incl. "Slot just filled") flashed; availability refetched after each attempt.

### File List

- `packages/catalog/src/schedules.ts` (`bookSlot` + `SlotFullError`/`SlotNotFoundError`/`ServicePriceMissingError`/`DuplicateBookingError`), `index.ts`
- `packages/contracts/src/index.ts` (`bookingCreateSchema`, `BookingConfirmation`)
- `packages/auth/src/audit-actions.ts` (`booking.created`); `packages/sms/src/templates.ts` (`booking.confirmed`)
- `apps/api/src/routes/parents/booking.ts` (new) + `index.ts`
- `apps/platform/lib/book-slots-api.ts` (`bookSlotRequest`, `BookingError`); `app/(app)/book/service/[serviceId]/page.tsx` (booking interaction)
- Tests: `schedules.test.ts`, `booking.test.ts`

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved after fixes · **Reviewers:** Blind+Edge Hunter, Acceptance Auditor.

Resolved: **(High) unguarded post-commit audit** — moved the audit INSIDE `bookSlot`'s transaction (atomic; a committed booking is always audited, so no 500→retry→duplicate). **(High) no one-seat-per-child** — added a duplicate guard under the slot lock (`DuplicateBookingError` → 409). **(High, AC1) no booking UI** — browse-page slots are now tappable with a confirm step; the 409 "Slot just filled" message is surfaced (AC4).

Dismissed/documented: TOCTOU on past/active checks (tiny window; capacity is the lock-protected invariant); concurrency untestable on single-connection PGlite (READ COMMITTED assumption documented in `bookSlot`); UTC vs EAT (codebase convention); free-service 0-invoice (allowed); raw audit string (catalogue-checked).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC5 + code-review (3 fixes incl. atomic audit, duplicate guard, bookable UI). Full suite green; build verified. Status → done. | bmad-dev-story + code-review |
