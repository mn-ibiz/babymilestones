# Story 25.2: Parent picks a service, then a stylist, then a slot

Status: done

> Canonical ID: P3-E03-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S02.md

## Story

As parent,
I want to book a salon visit with a stylist I trust,
so that the capability described above is delivered.

## Acceptance Criteria

1. Booking flow: service → stylist (optional, default "Any available") → date → available slots.
2. If parent picks a stylist, only that stylist's slots show.
3. If "Any available" — system picks the least-busy stylist on confirmation.
4. Confirm → booking, attribution captured, pending invoice created.

## Tasks / Subtasks

- [x] Task 1: Implement Parent picks a service, then a stylist, then a slot (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Booking flow: service → stylist (optional, default "Any available") → date → available slots.
  - [x] Satisfy AC#2: If parent picks a stylist, only that stylist's slots show.
  - [x] Satisfy AC#3: If "Any available" — system picks the least-busy stylist on confirmation.
  - [x] Satisfy AC#4: Confirm → booking, attribution captured, pending invoice created.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E01
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd packages/catalog && pnpm vitest run` → 12 files, 165 tests passed (salon.test.ts: 22).
- `cd packages/contracts && pnpm vitest run` → 6 files, 128 tests passed.
- `pnpm vitest run src/routes/parents` (apps/api) → 15 files, 152 tests passed (salon.test.ts: 10).
- `pnpm vitest run` (apps/api full) → 75 files, 685 tests passed.
- `cd apps/platform && pnpm vitest run` → 25 files, 169 tests passed (salon-book.test.ts: 4).
- `pnpm typecheck` (root) → 17/17 packages successful.

### Completion Notes List

- Built on Story 25.1's salon module + the P2-E01 booking write path. No migration needed — reused `salon_slots` + `bookings.salon_slot_id` (migration 0088).
- Reused the existing booking/invoice/attribution write semantics: `bookSalonSlot` mirrors `bookSlot` (lock-then-check, pending invoice via `resolveServicePriceAt`, atomic `audit("booking.created")`). The `booking.created` audit action was already in the catalogue — no new audit action registered.
- A salon slot holds ONE seat; availability + the confirm path exclude any slot a non-cancelled booking already consumes (a cancelled booking frees its seat).
- AC3 "least-busy" rule (`resolveLeastBusyStylist`): among ACTIVE stylists with an open slot for the service on the date, pick the one with the FEWEST non-cancelled salon bookings on that date. Tie-break: the lexicographically-smallest `staffId` (UUID ascending) — deterministic + stable across runs. Retired stylists are never offered; throws `NoStylistAvailableError` when none are available.
- Attribution captures the resolved stylist (`bookings.staffId` + `staffNameSnapshot` + `staffRateSnapshot`), feeding the P3-E01 commission ledger.
- Parent UI: salon services link to `/book/salon/[serviceId]` (stylist-keyed 1-seat flow), distinct from the Play/Talent session-slot grid at `/book/service/[serviceId]`.

### File List

- packages/catalog/src/salon.ts (modified — `listAvailableSalonSlots`, `resolveLeastBusyStylist`, `bookSalonSlot` + error classes)
- packages/catalog/src/salon.test.ts (modified — booking + least-busy test suite)
- packages/catalog/src/index.ts (modified — exports)
- packages/contracts/src/index.ts (modified — salon booking schemas/types)
- apps/api/src/routes/parents/salon.ts (new — parent salon availability + confirm + least-busy routes)
- apps/api/src/routes/parents/salon.test.ts (new — route integration tests)
- apps/api/src/routes/parents/index.ts (modified — register salon routes)
- apps/platform/lib/book-slots-api.ts (modified — salon client helpers)
- apps/platform/lib/salon-book.ts (new — salon date-grouping view model)
- apps/platform/lib/salon-book.test.ts (new — view-model tests)
- apps/platform/app/(app)/book/salon/[serviceId]/page.tsx (new — parent salon booking page)
- apps/platform/app/(app)/book/page.tsx (modified — route salon services to the salon flow)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented parent salon booking (service → stylist → date → slot), least-busy resolution, confirm + attribution + pending invoice; API routes + parent UI; tests green | Amelia (dev-story) |
