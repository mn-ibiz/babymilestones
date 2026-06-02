# Story 25.3: Salon counter check-in and service completion

Status: done

> Canonical ID: P3-E03-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S03.md

## Story

As Reception, I want to check the child in and mark the service complete.

## Acceptance Criteria

1. Salon view shows today's bookings by stylist, by hour.
2. Tap booking → check in → wallet debit (P1-E03-S05) + commission line (P3-E01-S02).
3. Mark complete → photo capture optional (subject to consent), feedback prompt triggered (P5-E04).
4. Walk-in: receptionist creates parent (P1-E02-S02) → books a slot now → checks in.

## Tasks / Subtasks

- [x] Task 1: Implement Salon counter check-in and service completion (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Salon view shows today's bookings by stylist, by hour.
  - [x] Satisfy AC#2: Tap booking → check in → wallet debit (P1-E03-S05) + commission line (P3-E01-S02).
  - [x] Satisfy AC#3: Mark complete → photo capture optional (subject to consent), feedback prompt triggered (P5-E04).
  - [x] Satisfy AC#4: Walk-in: receptionist creates parent (P1-E02-S02) → books a slot now → checks in.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S02 - P1-E03 - P3-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/catalog && pnpm vitest run` → 173 passed (8 new salon counter/completion tests)
- `cd packages/contracts && pnpm vitest run` → 133 passed (new board-grouping + walk-in schema tests)
- `cd apps/api && pnpm vitest run src/routes/reception/` → 103 passed (12 new salon-counter route tests)
- `cd apps/admin && pnpm vitest run` → 230 passed (4 new salon-counter lib tests)
- `cd packages/db && pnpm vitest run` → 43 passed; `cd packages/wallet && pnpm vitest run` → 127 passed
- `cd packages/auth && pnpm vitest run src/audit-actions.test.ts` → 7 passed (new `salon.service.completed` action registered + used)
- `pnpm typecheck` → 17/17 packages green

### Completion Notes List

- **AC1 (board):** new catalog query `listSalonBookingsForDate` (booking → salon_slot → stylist → child → attendance join), grouped by a pure `@bm/contracts` helper `groupSalonBookingsByStylistAndHour` (stylist then `HH:00` hour). Surfaced at `GET /reception/salon/board` and on the new `apps/admin/app/reception/salon` screen.
- **AC2 (check-in):** `POST /reception/salon/checkin` REUSES the attendant `checkInBooking` orchestration verbatim — salon bookings carry their own invoice + wallet + staff attribution, so the wallet debit (P1-E03-S05) + commission line (P3-E01-S02) + attendance row + audit are identical to a session-slot check-in. Idempotent via the `attendances_booking_id_uniq` fence + idempotent debit + self-skipping commission hook (verified: a repeat check-in is 409 and posts only ONE commission accrual).
- **AC3 (complete):** `completeSalonService` sets `attendances.completed_at/completed_by`; stores `photo_ref` ONLY when the child's `photoConsent` is true (consent gate — result flags `photoStored` / `photoSkippedNoConsent`); audits the new `salon.service.completed` action; then fires a **forward-compatible feedback hook** AFTER commit. **Feedback hook approach:** `SalonFeedbackHook` type with a default `noopSalonFeedbackHook`, injected through `AppDeps.salonFeedbackHook → ReceptionDeps`. P5-E04 / Epic 34 wires a real dispatcher later; hook errors are swallowed so they never roll back a completed service. FOLLOW-UP: replace the no-op with the Epic 34 feedback-prompt engine.
- **AC4 (walk-in):** `POST /reception/salon/walk-in` COMPOSES the existing paths — creates a parent (+ wallet, mirroring P1-E02-S02) + child, `createAdHocSalonSlot` (a one-off slot with `availabilityId = null`, allowed by the 0088 schema), `bookSalonSlot` (25-2 — pending invoice + attribution + audit), then `checkInBooking`. Duplicate phone → 409 (no rows created); unknown service/stylist → 404 validated before any insert.
- **Migration 0089** (additive-only): `attendances.completed_at`, `completed_by`, `photo_ref`. Reuses the existing one-row-per-booking attendance instead of a new table.

### File List

- packages/db/migrations/0089_salon_service_completion.sql (new)
- packages/db/src/schema/attendances.ts (completion columns)
- packages/auth/src/audit-actions.ts (`salon.service.completed` action)
- packages/catalog/src/salon.ts (listSalonBookingsForDate, createAdHocSalonSlot, completeSalonService, SalonFeedbackHook + errors)
- packages/catalog/src/index.ts (re-exports)
- packages/catalog/src/salon.test.ts (8 new tests)
- packages/contracts/src/index.ts (board grouping helper + types, salon check-in/complete/walk-in schemas)
- packages/contracts/src/index.test.ts (new tests)
- apps/api/src/routes/reception/salon.ts (new route — board / checkin / complete / walk-in)
- apps/api/src/routes/reception/salon.test.ts (new — 12 tests)
- apps/api/src/routes/reception/index.ts (register + salonFeedbackHook dep)
- apps/api/src/app.ts (salonFeedbackHook AppDeps wiring)
- apps/admin/app/reception/salon/page.tsx (new UI surface)
- apps/admin/lib/salon-counter.ts (new view-model helpers)
- apps/admin/lib/salon-counter.test.ts (new — 4 tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 0.2 | Implemented salon counter board, check-in (reused), service completion + consent-gated photo + forward-compatible feedback hook, and walk-in compose path; migration 0089; reception UI surface | Amelia (dev-story) |
