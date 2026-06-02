# Story 25.4: Reassign a salon booking between stylists

Status: done

> Canonical ID: P3-E03-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S04.md

## Story

As Reception, I want to move a child to a different stylist on the day if needed.

## Acceptance Criteria

1. Drag/select-and-reassign in the daily view.
2. New stylist must be available; double-book prevented.
3. Attribution snapshot updated; audit recorded.
4. If service already settled (rare), commission lines move proportionally.

## Tasks / Subtasks

- [x] Task 1: Implement Reassign a salon booking between stylists (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: Drag/select-and-reassign in the daily view. (tested select-and-reassign control in the admin salon counter; `POST /reception/salon/reassign` endpoint)
  - [x] Satisfy AC#2: New stylist must be available; double-book prevented. (lock-then-check on the target's slot, reusing the 25-2 single-seat guard; `SalonStylistUnavailableError` → 409)
  - [x] Satisfy AC#3: Attribution snapshot updated; audit recorded. (`bookings.staffId` + `staffNameSnapshot` repointed; `salon.booking.reassigned` audit row)
  - [x] Satisfy AC#4: If service already settled (rare), commission lines move proportionally. (reverse old accrual + post a new `reassign` line at the new stylist's rate, reusing `reverseBookingCommission`; unsettled bookings just update attribution for future accrual)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S03.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E03-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E03.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- New write path `reassignSalonBooking` in `@bm/catalog` (`packages/catalog/src/salon.ts`): runs in a transaction that locks the booking, picks the target stylist's earliest open slot for the SAME service + date, and re-checks that slot's single seat under a `SELECT … FOR UPDATE` lock (reuses the 25-2 lock-then-check double-book guard, AC2). On success it repoints `bookings.salonSlotId` (freeing the old slot's seat) and updates the attribution snapshot `staffId` + `staffNameSnapshot` (AC3), then audits `salon.booking.reassigned`. Reassigning to the current stylist is an idempotent no-op. New `SalonStylistUnavailableError` (unknown/retired target or no open slot).
- Commission move (AC4) lives in `@bm/wallet` as `reassignBookingCommission` (the ledger helpers live there; `@bm/wallet` depends on `@bm/catalog`, not the reverse). When a `source='booking'` accrual exists (settled), it reverses the old stylist's accrual via the existing `reverseBookingCommission` (signed-opposite `refund_reversal` row, append-only) and posts a fresh positive `source='reassign'` line to the new stylist at THEIR rate in force at booking time. Net to the old stylist → 0; new stylist nets their commission. When no accrual exists (not yet settled) it is a no-op and future accrual lands on the new stylist via the existing `recordBookingCommission` attribution. Idempotent on replay.
- Migration `0090_commission_reassign_source.sql` widens the `commission_ledger` source CHECK to allow `'reassign'` (additive; the `'reassign'` line sits outside the `one_accrual_per_booking` partial unique index and is invisible to accrual/refund helpers which key on `source='booking'`).
- API `POST /reception/salon/reassign` (`apps/api/src/routes/reception/salon.ts`): `create payment` guarded; orchestrates catalog reassign then, only when the booking was already settled, the wallet commission move. `SalonStylistUnavailableError` → 409, `SalonBookingNotFoundError` → 404.
- Reception UI: a tested select-and-reassign control on the salon counter board (`apps/admin/app/reception/salon/page.tsx`) backed by pure view-model helpers `canReassign` / `reassignTargetOptions` / `salonReassignMessage` (`apps/admin/lib/salon-counter.ts`).
- New audit action `salon.booking.reassigned` registered in `packages/auth/src/audit-actions.ts` (salon category); the audit-actions completeness test passes.

### File List

- packages/db/migrations/0090_commission_reassign_source.sql (new)
- packages/catalog/src/salon.ts
- packages/catalog/src/salon.test.ts
- packages/catalog/src/index.ts
- packages/wallet/src/commission-hook.ts
- packages/wallet/src/commission-hook.test.ts
- packages/wallet/src/index.ts
- packages/auth/src/audit-actions.ts
- packages/contracts/src/index.ts
- apps/api/src/routes/reception/salon.ts
- apps/api/src/routes/reception/salon.test.ts
- apps/admin/lib/salon-counter.ts
- apps/admin/lib/salon-counter.test.ts
- apps/admin/app/reception/salon/page.tsx

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 1.0 | Implemented reassign of a salon booking between stylists: catalog write path (lock-then-check slot + attribution + audit), wallet settled-commission move (reverse old / post new `reassign` line), `POST /reception/salon/reassign` endpoint, reception select-and-reassign UI, migration 0090, new `salon.booking.reassigned` audit action. TDD; all affected suites + typecheck green. | Amelia (dev-story) |
