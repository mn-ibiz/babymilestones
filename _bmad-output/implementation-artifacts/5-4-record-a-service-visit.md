# Story 5.4: Record a service visit

Status: ready-for-dev

> Canonical ID: P1-E05-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S04.md

## Story

As Reception,
I want to record that a child attended a service, attribute it to a staff member, and let the system handle payment,
so that visits are tracked and billed without manual math.

## Acceptance Criteria

1. Service picker (loaded from `services`, active only) → child picker (parent's children) → staff attribution picker (loaded from `staff`, active only).
2. Snapshot of staff name + rate stored on the booking row (`staff_name_snapshot`, `staff_rate_snapshot`).
3. Confirm → `bookings` row + `invoices` row → immediate check-in → `wallet.debit` per P1-E03-S05.
4. If wallet insufficient + auto-credit off → user warned + booking still proceeds + outstanding created.

## Tasks / Subtasks

- [ ] Task 1: Booking schema + snapshots (AC: #2, #3)
  - [ ] Additive migration in `packages/db` — `bookings` (with `staff_name_snapshot`, `staff_rate_snapshot`, checked-in state) and `invoices` link; confirm `services`/`staff` have active flags
- [ ] Task 2: Visit contract (AC: #1, #2)
  - [ ] Add record-visit Zod schema in `packages/contracts` (service_id, child_id, staff_id) + active-only filters
- [ ] Task 3: Record-visit route (AC: #2, #3, #4)
  - [ ] `apps/api/src/routes/reception/record-visit.ts` — create `bookings` row with staff name+rate snapshot, create `invoices` row, mark immediate check-in, call `@bm/wallet` debit (FIFO/idempotent per P1-E03-S05) in one transaction
  - [ ] On insufficient balance + auto-credit off → still create booking, create outstanding (open invoice), return warning flag
  - [ ] Register route in `apps/api/src/app.ts` (buildApp); write `audit_outbox` row
- [ ] Task 4: Record-visit UI (AC: #1, #4)
  - [ ] `apps/admin` Reception — service picker (active only) → child picker (parent's children) → staff picker (active only) → confirm; surface insufficient-funds warning while proceeding
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: snapshot capture, active-only filtering, outstanding-on-insufficient logic (vitest, test-first)
  - [ ] Integration: confirm → booking+invoice+check-in+debit in one tx; insufficient+auto-credit-off path creates outstanding and warns
  - [ ] E2E: full pick→confirm flow; insufficient-funds warning path

## Dev Notes

- Staff name + rate are snapshotted onto the booking (`staff_name_snapshot`, `staff_rate_snapshot`) so later staff/rate changes don't rewrite history.
- Booking, invoice, check-in, and `wallet.debit` happen together; debit follows P1-E03-S05 (FIFO, idempotency). On insufficient funds with auto-credit off, the booking still proceeds and an outstanding (open invoice) is created — the visit is never blocked.
- No double-booking check in P1 (that's P2 time-slot booking); P1 only records arrivals.
- Source paths to touch: `apps/api/src/routes/reception/record-visit.ts`, `apps/admin` Reception visit flow, `packages/db` (`bookings`/`invoices` migration), `packages/contracts` (visit schema), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI in `apps/admin`; schema in `packages/db`; ledger via `packages/wallet`.
- Dependencies (from source): S01–S03, P1-E03 (wallet/debit), P1-E07 (services/staff catalog). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
