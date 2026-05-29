# Story 18.2: Attendant check-in screen

Status: done

> Canonical ID: P2-E03-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S02.md

## Story

As attendant (operated via Reception's screen),
I want to check children in for a session in seconds,
so that the capability described above is delivered.

## Acceptance Criteria

1. Today's session slots listed; tap → booking list for that slot.
2. For each booking: child card with name + photo (if consented) + drop-off time field.
3. Check-in triggers wallet debit (P1-E03-S05) and records `attendance.checked_in_at`.
4. Bulk check-in supported (rare but useful).

## Tasks / Subtasks

- [x] Task 1: Implement Attendant check-in screen (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Today's session slots listed; tap → booking list for that slot.
  - [x] Satisfy AC#2: For each booking: child card with name + photo (if consented) + drop-off time field.
  - [x] Satisfy AC#3: Check-in triggers wallet debit (P1-E03-S05) and records `attendance.checked_in_at`.
  - [x] Satisfy AC#4: Bulk check-in supported (rare but useful).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

### Review Follow-ups (AI)

- [x] [AI-Review][High] Crash-recovery: reordered check-in to debit FIRST (idempotent) then record attendance, so a crash never strands an uncollected charge behind the attendance fence.
- [x] [AI-Review][High] Handle an already-non-pending invoice (FIFO-settled by a top-up) gracefully — resolve outcome from invoice status instead of an unhandled 500. Regression test added.
- [x] [AI-Review][Med] Fixed a 3-hour drop-off timezone skew in the admin screen (parse the wall-clock time as local, not UTC).

### Code Review (2026-05-29 · 10-agent parallel review + full suite)

- [x] [Review][Patch] Validate the `slotId` path param → 400 (was an uncaught 500 on a malformed uuid). [attendance.ts]
- [x] [Review][Test] Added coverage: subscription-`covered` check-in (no wallet debit), CSRF rejection + 400 input validation on the mutating routes, malformed-`slotId` → 400.
- [x] [Review][Verify] AC1–AC4 confirmed; debit-before-attendance ordering, the double-check-in 409 fence, and the out-of-band-settled path all re-verified. Full API suite green (512).

## Dev Notes

Reception screen sub-route. Same auth as Reception.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E01 - P1-E03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E03-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References

- `pnpm vitest run src/routes/reception/attendance.test.ts` (apps/api) — 9/9 green.
- `pnpm turbo run test` — full regression 17/17 packages green (API 495, admin 174).

### Completion Notes List

- New `attendances` table (migration `0053`) — DISTINCT from `bookings.checked_in_at` (the P1 walk-in stamp); one row per booking with a UNIQUE fence on `booking_id`.
- AC1: `GET /reception/attendance/slots?date=` lists today's session slots (default today via injected clock) with booked + checked-in counts, filtered to slots with bookings.
- AC2: `GET /reception/attendance/slots/:slotId/bookings` returns child cards (name, `photoConsent` flag, drop-off, paidVia, check-in/out timestamps). Photo gating is honest — there is no photo URL store, the card carries the consent flag only.
- AC3: `POST /reception/attendance/checkin` records `checked_in_at` (+ optional drop-off) and triggers the P1-E03-S05 wallet debit; subscription bookings resolve `covered` (no debit). Outcome surfaces `settled`/`settled_on_credit`/`outstanding`/`covered`.
- AC4: `POST /reception/attendance/checkin/bulk` — best-effort per booking, per-item ok/outcome/error.
- Reads gated to `read wallet`, mutations to `create payment` (same as record-visit). `now` threaded through `ReceptionDeps` + `app.ts`. Admin attendant screen at `app/reception/attendance`.
- ✅ Resolved review [High×2]: debit-before-attendance ordering (crash-safe, idempotent) + graceful already-settled-invoice handling.
- ✅ Resolved review [Med]: drop-off timezone fix.

### File List

- packages/db/migrations/0053_attendances.sql (new)
- packages/db/src/schema/attendances.ts (new)
- packages/db/src/schema/index.ts (modified — barrel export)
- packages/auth/src/audit-actions.ts (modified — attendance audit category)
- packages/contracts/src/index.ts (modified — attendance slot/card/check-in schemas + types)
- apps/api/src/routes/reception/attendance.ts (new — checkInBooking helper + routes)
- apps/api/src/routes/reception/attendance.test.ts (new)
- apps/api/src/routes/reception/index.ts (modified — wired route + now in ReceptionDeps)
- apps/api/src/app.ts (modified — thread now to reception routes)
- apps/admin/lib/attendance.ts (new)
- apps/admin/lib/attendance.test.ts (new)
- apps/admin/app/reception/attendance/page.tsx (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 1.0 | Implemented attendant check-in (attendances table, slot/card reads, single + bulk check-in with wallet debit), TDD; code review + 3 fixes resolved; status → review | bmad-dev-story |
