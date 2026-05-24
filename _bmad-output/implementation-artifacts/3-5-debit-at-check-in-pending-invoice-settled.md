# Story 3.5: Debit at check-in; pending invoice settled

Status: done

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

- [~] Task 1: Booking creates pending invoice (AC: #1)
  - [x] Invoice schema now carries the AC1 shape: `status='pending'`, `amount_due`, `parent_id`, and the new nullable `service_id` (migration 0014, `invoices.ts`). Exercised by the debit + check-in tests which create pending invoices.
  - [~] Booking *endpoint* deferred: the booking flow that creates the invoice is a separate epic dependency (no booking epic in P1-E03 scope; services catalogue is P1-E07). The invoice shape AC1 requires is in place and tested. See review-findings.md item 4.
- [x] Task 2: Implement `wallet.debit()` with row lock (AC: #2, #3, #4, #5)
  - [x] `debit({ walletId, invoiceId, ... })` in `packages/wallet/src/debit.ts`: `SELECT ... FOR UPDATE` on the wallet, computed SUM balance, four-path branch (settled / settled_on_credit / outstanding), all in one transaction. Audited as `wallet.checkin_debit`.
- [x] Task 3: Block double check-in (AC: #6)
  - [x] Partial UNIQUE index `wallet_ledger_invoice_settlement (invoice_id) WHERE kind='checkin'` (migration 0014). A second distinct check-in surfaces `DoubleCheckInError` (sequential case caught explicitly; concurrent race fenced by the index).
- [x] Task 4: Check-in route (AC: #2)
  - [x] `POST /parents/check-in` in `apps/api/src/routes/parents/checkin.ts` — derives the wallet from the invoice's parent (server-trusted), calls `wallet.debit`, maps outcomes to 200 / 409 / 404.
- [x] Task 5: Tests (all)
  - [x] Tests written first: `packages/wallet/src/debit.test.ts` (all four paths AC3–AC5, idempotent replay AC2, double-check-in AC6, audit, guards) and `apps/api/src/routes/parents/checkin.test.ts` (route integration incl. auth/CSRF).

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

claude-opus-4-7

### Debug Log References

- Initial `debit.test.ts` failures: audit `actor_user_id` is `uuid`; test fixtures passed a free-text `postedBy` ("reception-1") → fixed tests to pass a real seeded user id.
- AC6 sequential double-check-in surfaced via the "not pending" guard rather than the UNIQUE index → added an explicit check for an existing `kind='checkin'` linkage that throws `DoubleCheckInError`; the partial UNIQUE index remains the durable fence for the concurrent-race case.

### Completion Notes List

- Migration 0014 (additive): `wallets.auto_credit_enabled` (default false), `invoices.service_id` (nullable, no FK — services are P1-E07), extended `invoices.status` CHECK to `pending|settled|settled_on_credit|outstanding`, `wallet_ledger_invoice_settlement.kind` (`topup|checkin`) + partial UNIQUE index for AC6.
- `wallet.debit()` runs the lock + balance read + ledger debit + invoice transition + linkage + audit in ONE transaction; idempotent via the ledger idempotency key; outstanding path posts no ledger row.
- Auto-credit flag is read-only here; the per-parent toggle UI/endpoint is P1-E03-S07.
- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Low-severity follow-ups in `3-5-debit-at-check-in-pending-invoice-settled-review-findings.md`.

### File List

- packages/db/migrations/0014_checkin_debit.sql (new)
- packages/db/src/schema/wallets.ts
- packages/db/src/schema/invoices.ts
- packages/db/src/schema/wallet-ledger-invoice-settlement.ts
- packages/wallet/src/debit.ts (new)
- packages/wallet/src/debit.test.ts (new)
- packages/wallet/src/index.ts
- packages/contracts/src/index.ts
- apps/api/src/routes/parents/checkin.ts (new)
- apps/api/src/routes/parents/checkin.test.ts (new)
- apps/api/src/routes/parents/index.ts

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented check-in debit + invoice settlement (wallet.debit, migration 0014, /parents/check-in route, tests); review complete | claude-opus-4-7 |
