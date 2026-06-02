# Story 25.1: Stylist availability and slot creation

Status: done

> Canonical ID: P3-E03-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S01.md

## Story

As admin, I want to declare which stylist is in on which day so the booking grid respects it.

## Acceptance Criteria

1. `staff_availability` table: staff_id, day_of_week, start_time, end_time, effective_date_range.
2. Slots generated nightly into `salon_slots` from staff availability × salon service durations.
3. Past/today edits don't retroactively change historical bookings.

## Tasks / Subtasks

- [x] Task 1: Implement Stylist availability and slot creation (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `staff_availability` table: staff_id, day_of_week, start_time, end_time, effective_date_range.
  - [x] Satisfy AC#2: Slots generated nightly into `salon_slots` from staff availability × salon service durations.
  - [x] Satisfy AC#3: Past/today edits don't retroactively change historical bookings.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Re-uses the P2-E01 slot mechanics scoped to salon.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P2-E01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/db && pnpm vitest run` → 43 passed (9 files)
- `cd packages/catalog && pnpm vitest run` → 155 passed (12 files)
- `cd apps/jobs && pnpm vitest run` → 108 passed (19 files)
- `pnpm typecheck` (root) → 17/17 packages successful

### Completion Notes List

- Re-used the P2-E01 booking-engine slot mechanics, scoped to the salon unit. The
  pure window/date math (`slotWindows`, `enumerateSlotDates`, `dayOfWeekIso`,
  `addDaysIso`) is reused directly from `schedules.ts`.
- AC1: new `staff_availability` table (staff_id, day_of_week, start_time,
  end_time + an effective date range modelled as `effective_from` /
  `effective_to`, the latter nullable = open/ongoing). CRUD + `activeOnly` /
  per-stylist list helpers, plus the pure `availabilityCoversDate` range guard.
- AC2: new `salon_slots` table + a nightly `salon-slot-generation` cron mirroring
  `slot-generation.ts` and registered in `apps/jobs/src/index.ts`. Salon service
  durations are modelled as a new nullable, positive `services.salon_duration_minutes`
  column (only `unit = 'salon'` services carry one). The generator crosses every
  active availability × every active salon service with a duration, chopping each
  availability window into back-to-back slots of the service's duration (partial
  trailing window dropped). `durationMinutes` is snapshotted onto each slot.
- AC3: generation is future-only (horizon starts at `fromDate`/today) and
  idempotent via the `(availability_id, service_id, slot_date, start_time)` unique
  index — the nightly cron is purely additive and never prunes, so past/booked
  slots are never touched. Availability edits use `resyncStaffAvailabilitySlots`,
  which only withdraws FUTURE, unbooked slots (`bookings.salon_slot_id` protects
  booked slots; past slots `< fromDate` are never deleted) before re-materialising.
- No new audit action: the generator mirrors the existing non-auditing
  `slot-generation` cron, so `@bm/auth` was untouched.

### File List

- packages/db/migrations/0088_staff_availability_salon_slots.sql (new)
- packages/db/src/schema/staff-availability.ts (new)
- packages/db/src/schema/index.ts (modified — export new schema)
- packages/db/src/schema/services.ts (modified — `salonDurationMinutes` column)
- packages/db/src/schema/bookings.ts (modified — `salonSlotId` column + index)
- packages/catalog/src/salon.ts (new)
- packages/catalog/src/salon.test.ts (new)
- packages/catalog/src/services.ts (modified — duration in create/update input)
- packages/catalog/src/index.ts (modified — export salon surface)
- apps/jobs/src/jobs/salon-slot-generation.ts (new)
- apps/jobs/src/jobs/salon-slot-generation.test.ts (new)
- apps/jobs/src/index.ts (modified — import/export/register the cron)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 0.2 | Implemented staff_availability + salon_slots + nightly salon slot-generation cron (AC1–3); TDD, tests + typecheck green | Amelia (dev-story) |
