# Story 16.1: Time-slot model and capacity for services

Status: done

> Canonical ID: P2-E01-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S01.md

## Story

As admin, I want to define when a service is available and how many children fit per slot.

## Acceptance Criteria

1. `service_schedules` table: service_id, day_of_week (0-6), start_time, end_time, slot_duration_minutes, capacity, is_active.
2. A schedule generates concrete `session_slots` for the next 60 days; regenerated nightly.
3. Each slot has computed `remaining_capacity` = `capacity − bookings_in_slot`.
4. Admin CRUD; changes don't retroactively touch booked slots, only future ones.
5. Audit on schedule changes.

## Tasks / Subtasks

- [x] Task 1: Implement Time-slot model and capacity for services (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: `service_schedules` table: service_id, day_of_week (0-6), start_time, end_time, slot_duration_minutes, capacity, is_active. (migration 0042 + `schedules.ts` schema + `createSchedule`/`updateSchedule`/`getSchedule`/`listSchedules` in `@bm/catalog`)
  - [x] Satisfy AC#2: A schedule generates concrete `session_slots` for the next 60 days; regenerated nightly. (`generateSlotsForSchedule`/`regenerateActiveSlots` + nightly `slot-generation` cron in `apps/jobs`)
  - [x] Satisfy AC#3: Each slot has computed `remaining_capacity` = `capacity − bookings_in_slot`. (`listSlotsWithRemaining`/`getSlotWithRemaining`; never stored)
  - [x] Satisfy AC#4: Admin CRUD; changes don't retroactively touch booked slots, only future ones. (capacity snapshot + idempotent `onConflictDoNothing` generation; admin CRUD API)
  - [x] Satisfy AC#5: Audit on schedule changes. (`catalog.schedule.create`/`catalog.schedule.update` audited on every mutation; registered in the audit catalogue)
  - [x] Touch / create: `apps/jobs`, `packages/catalog/schedules.ts`
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate) — catalog domain (18 tests), API route integration (8 tests), nightly cron (2 tests). Full monorepo suite green (17/17 packages).

## Dev Notes

Slot pre-materialisation simplifies booking queries; cron in `apps/jobs`. Files: `packages/catalog/schedules.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E07.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E01-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- Full monorepo test suite green: 17/17 packages.
- Pre-existing audit-catalogue gap fixed: `db-backup.ts` (X8-S03) emitted `backup.run.{succeeded,failed,pruned}` but they were never registered in `@bm/auth` audit catalogue → the audit-completeness test was failing on clean `main`. Registered them under a new `backup` category. Unrelated to this story but required to keep the suite green.

### Completion Notes List

- **AC1** — `service_schedules` model: migration `0042` + `packages/db/src/schema/schedules.ts` (pre-existing on disk) plus CRUD in `packages/catalog/src/schedules.ts` (`createSchedule`/`updateSchedule`/`getSchedule`/`listSchedules`).
- **AC2** — Slot materialisation: `generateSlotsForSchedule` expands a schedule into `(date × window)` rows over a 60-day horizon (`SLOT_GENERATION_HORIZON_DAYS`), dropping partial trailing windows. Idempotent via the `(schedule_id, slot_date, start_time)` unique index. `regenerateActiveSlots` drives the nightly `slot-generation` cron in `apps/jobs` (daily cadence).
- **AC3** — `remaining_capacity` is never stored: `listSlotsWithRemaining`/`getSlotWithRemaining` compute `capacity − bookings_in_slot` (counting `bookings.slot_id`) at read time, clamped ≥ 0.
- **AC4** — Capacity is SNAPSHOT onto each slot at generation time; idempotent regeneration never rewrites an existing/booked slot, so schedule edits only affect FUTURE slots. Admin CRUD lives over `/admin/services/:serviceId/schedules` + `/admin/schedules/:id`.
- **AC5** — Every schedule mutation writes an `audit_outbox` row (`catalog.schedule.create` / `catalog.schedule.update`); actions registered in the `@bm/auth` audit catalogue. Routes guarded by `manage service` (admin/super_admin); acting user is the session user.
- Contracts: `scheduleCreateSchema` / `scheduleUpdateSchema` (HH:MM validation, start<end, slot fits window, 0–6 day, capacity bounds).

### File List

- `packages/catalog/src/schedules.ts` (new)
- `packages/catalog/src/schedules.test.ts` (new)
- `packages/catalog/src/index.ts` (modified — exports)
- `packages/contracts/src/index.ts` (modified — schedule schemas)
- `apps/api/src/routes/admin/schedules.ts` (new)
- `apps/api/src/routes/admin/schedules.test.ts` (new)
- `apps/api/src/routes/admin/index.ts` (modified — route registration)
- `apps/jobs/src/jobs/slot-generation.ts` (new)
- `apps/jobs/src/jobs/slot-generation.test.ts` (new)
- `apps/jobs/src/index.ts` (modified — job registration)
- `apps/jobs/package.json` (modified — `@bm/catalog` dep)
- `packages/auth/src/audit-actions.ts` (modified — `catalog.schedule.*` + `backup.*` registration)
- `packages/db/src/schema/schedules.ts` (pre-existing on disk — schema)
- `packages/db/src/schema/bookings.ts` (pre-existing on disk — `slot_id`)
- `packages/db/src/schema/index.ts` (pre-existing on disk — export)
- `packages/db/migrations/0042_service_schedules_session_slots.sql` (pre-existing on disk)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-29 | 0.2 | Implemented AC1–AC5: catalog domain logic, admin CRUD API + audit, nightly cron, contracts, tests. Full suite green. | bmad-dev-story |
| 2026-05-29 | 0.3 | Code review (3 adversarial layers) + fixes applied: AC4 slot reconciliation on edit/retire, partial-update validation, atomic create/update transactions, chunked inserts, slot-param validation, inactive-service guard. Status → done. | bmad-code-review |

## Senior Developer Review (AI)

**Date:** 2026-05-29 · **Outcome:** Approved (all actionable findings resolved) · **Reviewers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor (parallel, no shared context).

Per-AC verdict: AC1–AC5 all met. The substantive findings clustered on AC4 mutation semantics.

### Resolved (patched + tested)

- **[High] Structural edits / deactivation left stale, duplicated future slots.** Editing `startTime`/`endTime`/`slotDurationMinutes`/`dayOfWeek`, or retiring a schedule, previously left old-window/retired-rule slots bookable (additive `onConflictDoNothing` never pruned). Fixed with `deleteFutureUnbookedSlots` + `resyncScheduleSlots` (prune future UNBOOKED slots, re-materialise current rule) invoked on every route mutation; booked slots keep their snapshot. New catalog + route tests.
- **[High] Partial update bypassed window invariants.** A patch with only `endTime` or only `slotDurationMinutes` could invert the window or exceed it → silent zero-slot generation or a raw DB-CHECK 500. Fixed: route merges the patch onto the stored row and re-validates (start<end, slot fits window) → clean 400. New tests.
- **[Med] Non-atomic create/update + slot-gen + audit.** Wrapped each in `db.transaction` (all-or-nothing, AC5 guarantee).
- **[Med/Low] Param-limit crash on huge inserts.** Chunked slot inserts (500/batch) + raised min slot duration to 5 min (≤288 windows/day).
- **[Low] `/slots` `from`/`to` unvalidated → 500.** Now validated to `YYYY-MM-DD` → 400.
- **[Low] Schedules on a soft-deleted service.** Create now 409s for an inactive service.

### Deferred to downstream stories (write path not in this story)

- **`remaining_capacity` counts all bookings on a slot** — cancellation (16-6) must clear `slot_id` (or this count must exclude cancelled bookings) to release a seat. No cancellation/booking-status path exists yet, so today "bookings in slot" == "active". Documented in `bookingCountsBySlot`.
- **Overbooking under concurrency** — the booking WRITE path (16-3) must enforce capacity inside a transaction that locks the slot row (`SELECT … FOR UPDATE`), since remaining is computed not stored. Documented.

### Dismissed

- EAT-vs-UTC "today": the codebase uses UTC date strings throughout (receipts, reconciliation windows, date validation); matching that convention is correct — introducing EAT only here would diverge.
- No hard DELETE (intentional soft-retire), cron not wired to a live scheduler (matches every sibling job; deploy story wires them), cross-schedule overlap (by design, booking layer's concern).
