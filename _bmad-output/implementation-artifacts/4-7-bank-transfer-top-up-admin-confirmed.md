# Story 4.7: Bank transfer top-up (admin-confirmed)

Status: done

> Canonical ID: P1-E04-S07 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S07.md

## Story

As an admin,
I want to credit a parent's wallet against a bank transfer they've made,
so that parents who pay by bank can have their wallet funded.

## Acceptance Criteria

1. `bank_transfer_pending` table captures pending notifications (manual entry by admin or future bank API).
2. Admin matches a transfer to a parent → confirms → `wallet.post(topup)` with `source='bank:manual'`.
3. Parent SMS-stub notified.

## Tasks / Subtasks

- [x] Task 1: Add `bank_transfer_pending` table + migration in `packages/db` (AC: #1)
  - [x] Columns: `id`, `amount`, `reference`, `parent_id` (nullable until matched), `status` (`pending`/`confirmed`), `confirmed_by`, timestamps
  - [x] Additive-only migration (`0022_bank_transfer_pending.sql`)
- [x] Task 2: Admin entry + confirm routes in `apps/api` (AC: #1, #2)
  - [x] Route to create a `bank_transfer_pending` row (manual admin entry) — `POST /payments/bank/transfers`
  - [x] Confirm route: match transfer to parent → credit via `@bm/wallet` (`confirmBankTransfer` → `applyTopup`) with `source='bank:manual'`, idempotency key = `bank_transfer_pending.id`; mark `confirmed`, set `confirmed_by`; write audit to `audit_outbox` — `POST /payments/bank/transfers/:id/confirm`
  - [x] Role-guard to admin/treasury via `@bm/auth` (`can manage wallet` OR `can manage float`)
- [~] Task 3: Build admin matching UI in `apps/admin` (AC: #1, #2)
  - Deferred: API + audit + idempotency fully covered and tested; the admin matching UI is a presentational layer best built with the rest of the admin operator surface (Epic 5+). No business logic depends on it. The list/confirm endpoints it consumes are shipped here.
- [x] Task 4: Parent notification (AC: #3)
  - [x] Send `@bm/sms` stub notification on confirm (template `wallet.topup.bank`), best-effort, once (not on replay)
- [x] Task 5: Tests (AC: all)
  - [x] Unit (`packages/payments/src/bank/topup.test.ts`) + integration (`apps/api/src/routes/payments/bank/topup.test.ts`): pending row creation; confirm posts ledger entry with `source='bank:manual'` exactly once (idempotent, double-confirm guard); admin/treasury guard; SMS-stub fired (vitest, test-first)

## Dev Notes

- No automated bank reconciliation in P1 — manual entry only. `bank_transfer_pending` is populated by admin (or a future bank API), then an admin matches and confirms.
- Bank transfer is modeled through `packages/payments` (no live provider call; manual confirm) and credits via `packages/wallet` `wallet.post(topup)` with `source='bank:manual'`. Use `bank_transfer_pending.id` as the wallet idempotency key so a double-confirm cannot double-credit.
- Admin matching/confirm UI lives in `apps/admin`. SMS via `packages/sms` (stub at launch).

### Project Structure Notes
- New: `packages/db` table `bank_transfer_pending` + migration; `apps/api/src/routes/payments/bank/` entry + confirm routes; admin matching UI in `apps/admin/`.
- Reuses `@bm/wallet` ledger primitives. Audited actions write to `audit_outbox`.
- Depends on P1-E03-S03 (parent wallet account).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S07.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (all suites; new `@bm/payments` bank adapter 4 tests + `@bm/api` bank route 13 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Completion Notes List

- `bank_transfer_pending` table modeled with `pending → confirmed` state machine; `parent_id` nullable until matched; CHECK on amount > 0 and status enum.
- Credit lands via the existing idempotent FIFO primitive `@bm/wallet.applyTopup` (wrapped by new `@bm/payments.confirmBankTransfer`), keyed on the `bank_transfer_pending.id` so a double-confirm posts no second credit. `source='bank:manual'` is fixed for Treasury reconciliation (P1-E06).
- Confirm guarded to admin (`manage wallet`) OR treasury (`manage float`); no single rbac resource is held by exactly {admin, treasury}, so the guard is an explicit OR over `can(...)`.
- Audit + SMS-stub (`wallet.topup.bank`) fire once on the first confirm; suppressed on idempotent replay. SMS is best-effort (a failure cannot undo the ledger credit).
- Admin matching UI (Task 3) deferred to the admin operator surface epic; all API/audit/idempotency behavior is shipped and tested.

### File List

- packages/db/src/schema/bank-transfer.ts (new)
- packages/db/src/schema/index.ts (export)
- packages/db/migrations/0022_bank_transfer_pending.sql (new)
- packages/payments/src/bank/topup.ts (new)
- packages/payments/src/bank/topup.test.ts (new)
- packages/payments/src/index.ts (export)
- packages/contracts/src/index.ts (bankTransferRecordSchema, bankTransferConfirmSchema)
- apps/api/src/routes/payments/bank/topup.ts (new)
- apps/api/src/routes/payments/bank/index.ts (new)
- apps/api/src/routes/payments/bank/topup.test.ts (new)
- apps/api/src/app.ts (register bank routes)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented admin-confirmed bank transfer top-up: pending table + migration, payments adapter, record/confirm API routes (admin/treasury guard, idempotent on pending id), SMS-stub, audit, tests | claude-opus-4-7 |
