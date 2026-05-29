# Story 23.2: Commission line recorded on every attributed booking

Status: done

> Canonical ID: P3-E01-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S02.md

## Story

As accountant, I want every salon visit to write a commission line for traceability.

## Acceptance Criteria

1. On booking settle (wallet debit or subscription consumption), if `attributed_staff_id IS NOT NULL`, insert a `commission_ledger` row: staff_id, booking_id, amount_cents, rate_snapshot, source.
2. Refunds reverse the commission via reversing entry.
3. Commission amount = service price × rate at booking time.
4. Ledger is append-only.

## Tasks / Subtasks

- [x] Task 1: Implement Commission line recorded on every attributed booking (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: On booking settle (wallet debit or subscription consumption), if `attributed_staff_id IS NOT NULL`, insert a `commission_ledger` row: staff_id, booking_id, amount_cents, rate_snapshot, source. (`recordBookingCommission` wired into record-visit + attendance check-in)
  - [x] Satisfy AC#2: Refunds reverse the commission via reversing entry. (`reverseBookingCommission` signed-opposite row, wired into the admin refund route)
  - [x] Satisfy AC#3: Commission amount = service price × rate at booking time. (`commissionCents(staffRateSnapshot, resolveRateAt(staffId, booking.createdAt))`)
  - [x] Satisfy AC#4: Ledger is append-only. (reversals are new rows; original untouched; one-accrual-per-booking partial unique index)
  - [x] Touch / create: `packages/wallet/src/commission-hook.ts`
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Hooks into wallet debit completion. `packages/wallet/commission-hook.ts`.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E03 - P1-E07
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E01-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E01.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run` — 146 passed (incl. 6 commission-hook)
- `pnpm -C packages/db exec vitest run` — 98 passed
- `pnpm -C apps/api exec vitest run src/routes/reception/attendance.test.ts src/routes/reception/record-visit.test.ts src/routes/admin/refund.test.ts` — 35 passed (no regression)
- `pnpm -C packages/auth exec vitest run` — 118 passed (audit completeness sees the new `commission.ledger.posted/reversed`)
- typecheck clean: db, wallet, api, auth

### Completion Notes List

- `commission_ledger` (migration 0060) is an append-only ledger: a `source='booking'` accrual per attributed settled booking, and `source='refund_reversal'` signed-opposite rows for refunds. Partial unique index `one_accrual_per_booking` makes accrual idempotent (re-run safe, AC4); reversals are always new rows (append-only, AC4).
- `recordBookingCommission` (packages/wallet/src/commission-hook.ts) is the settle hook (AC1): commission = `commissionCents(booking.staffRateSnapshot, resolveRateAt(staffId, booking.createdAt))` — service-price snapshot × the rate in force at booking time, integer cents (AC3). It self-skips unattributed bookings + staff with no rate, and is idempotent on bookingId (onConflictDoNothing backstop). Wired into BOTH settle paths: P1 `record-visit` (wallet debit) and P2 `attendance` check-in (wallet debit OR subscription consumption).
- `reverseBookingCommission` posts the signed-opposite reversing row pointing at the accrual (AC2), idempotent + skips when there is no accrual. Wired into the admin refund route: original ledger entry → settlement linkage → invoice → booking → reverse.
- Audited: `commission.ledger.posted` / `commission.ledger.reversed`. `@bm/wallet` gained a `@bm/catalog` dep (no cycle — catalog does not import wallet) for `resolveRateAt` + `commissionCents`.

### File List

- packages/db/migrations/0060_commission_ledger.sql (new)
- packages/db/src/schema/commission-ledger.ts (new)
- packages/db/src/schema/index.ts (export)
- packages/wallet/src/commission-hook.ts (new)
- packages/wallet/src/commission-hook.test.ts (new)
- packages/wallet/src/index.ts (export)
- packages/wallet/package.json (+@bm/catalog dep)
- apps/api/src/routes/reception/record-visit.ts (wire accrual)
- apps/api/src/routes/reception/attendance.ts (wire accrual)
- apps/api/src/routes/admin/refund.ts (wire reversal)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Commission ledger (migration 0060), settle hook + refund reversal wired, TDD; all ACs met | Claude Opus 4.8 (1M context) |
