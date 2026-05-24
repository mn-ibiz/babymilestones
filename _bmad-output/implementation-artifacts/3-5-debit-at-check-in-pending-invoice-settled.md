# Story 3.5: Debit at check-in; pending invoice settled

Status: ready-for-dev

> Canonical ID: P1-E03-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S05.md

## Story

As Reception,
I want a child's check-in to debit the wallet automatically,
so that booked services are charged at the moment of check-in without manual accounting.

## Acceptance Criteria

1. Booking creates `invoice` row in `pending` status with `amount_due`, `parent_id`, `service_id`.
2. Check-in calls `wallet.debit({ invoiceId, ... })` inside `SELECT FOR UPDATE` on the wallet.
3. If wallet ≥ amount → debit, invoice → `settled`.
4. If wallet < amount AND `auto_credit_enabled` → debit anyway, balance goes negative, invoice → `settled_on_credit`.
5. If wallet < amount AND `auto_credit_enabled = false` → invoice → `outstanding`, no debit, booking still proceeds.
6. Double-check-in blocked by unique index on settlement linkage.

## Tasks / Subtasks

- [ ] Task 1: Booking creates pending invoice (AC: #1)
  - [ ] Booking flow inserts an `invoice` row (`status='pending'`, `amount_due`, `parent_id`, `service_id`) in `packages/db` schema; expose via API route under `apps/api/src/routes/`.
- [ ] Task 2: Implement `wallet.debit()` with row lock (AC: #2, #3, #4, #5)
  - [ ] Add `debit({ invoiceId, ... })` to `packages/wallet` that takes `SELECT ... FOR UPDATE` on the wallet, reads computed balance, and branches on the four paths:
    - balance ≥ amount → post debit ledger row, invoice → `settled`;
    - balance < amount AND `auto_credit_enabled` → post debit (balance may go negative), invoice → `settled_on_credit`;
    - balance < amount AND NOT `auto_credit_enabled` → no debit, invoice → `outstanding`, booking still proceeds.
  - [ ] All within one DB transaction.
- [ ] Task 3: Block double check-in (AC: #6)
  - [ ] Add a UNIQUE index on the settlement linkage (per invoice) so a second check-in for the same invoice cannot post a duplicate debit; surface a clear conflict.
- [ ] Task 4: Check-in route (AC: #2)
  - [ ] Wire a check-in endpoint under `apps/api/src/routes/` calling `wallet.debit`.
- [ ] Task 5: Tests (all)
  - [ ] Write tests FIRST covering all four balance/auto-credit paths (AC3–AC5), the `FOR UPDATE` debit (AC2), pending-invoice creation (AC1), and double-check-in rejection (AC6).

## Dev Notes

- Critical concurrency path: the `SELECT FOR UPDATE` on the wallet row serialises concurrent check-ins; double-check-in is additionally fenced by a UNIQUE index on the settlement linkage.
- Four mutually exclusive outcomes by (balance vs amount) × `auto_credit_enabled`; balance is the computed SUM (story 3.2), never a stored column — negative balances are allowed only under auto-credit.
- Lives in `packages/wallet` (`debit`), `packages/db` (invoice statuses `pending`/`settled`/`settled_on_credit`/`outstanding`, settlement linkage UNIQUE index), and `apps/api/src/routes/` (check-in endpoint).
- Testing standards: vitest, test-first — source mandates writing all four-path cases before implementation.

### Project Structure Notes
- `packages/wallet`: `debit()`. `packages/db`: invoice status enum + linkage UNIQUE index. `apps/api/src/routes/`: check-in route.
- Depends on P1-E03-S01..S04, P1-E07 (services / `service_id`), and P1-E02 (parent account / wallet).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E03]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
