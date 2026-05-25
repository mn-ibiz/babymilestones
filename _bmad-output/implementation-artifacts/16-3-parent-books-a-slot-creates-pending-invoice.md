# Story 16.3: Parent books a slot (creates pending invoice)

Status: backlog

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

- [ ] Task 1: Implement Parent books a slot (creates pending invoice) (AC: #1, #2, #3, #4, #5)
  - [ ] Satisfy AC#1: Tap slot → child picker (parent's eligible children only) → confirm.
  - [ ] Satisfy AC#2: Booking row created; `session_slots.bookings_in_slot` incremented atomically.
  - [ ] Satisfy AC#3: Pending invoice created for the service price at booking time (price snapshotted).
  - [ ] Satisfy AC#4: Capacity race: two parents booking the last seat — only one succeeds; the other sees a clear "Slot just filled" message.
  - [ ] Satisfy AC#5: SMS-stub confirmation sent with date/time and child name.
  - [ ] Touch / create: `apps/api/src/routes/bookings/create.ts`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
