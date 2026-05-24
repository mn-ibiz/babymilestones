# Story 4.7: Bank transfer top-up (admin-confirmed)

Status: ready-for-dev

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

- [ ] Task 1: Add `bank_transfer_pending` table + migration in `packages/db` (AC: #1)
  - [ ] Columns: `id`, `amount`, `reference`, `parent_id` (nullable until matched), `status` (`pending`/`confirmed`), `confirmed_by`, timestamps
  - [ ] Additive-only migration
- [ ] Task 2: Admin entry + confirm routes in `apps/api` (AC: #1, #2)
  - [ ] Route to create a `bank_transfer_pending` row (manual admin entry)
  - [ ] Confirm route: match transfer to parent → call `@bm/wallet` `wallet.post(topup)` with `source='bank:manual'`, idempotency key = `bank_transfer_pending.id`; mark `confirmed`, set `confirmed_by`; write audit to `audit_outbox`
  - [ ] Role-guard to admin via `@bm/auth`
- [ ] Task 3: Build admin matching UI in `apps/admin` (AC: #1, #2)
  - [ ] List pending transfers → select parent → confirm
- [ ] Task 4: Parent notification (AC: #3)
  - [ ] Send `@bm/sms` stub notification on confirm
- [ ] Task 5: Tests (AC: all)
  - [ ] Unit/integration: pending row creation; confirm posts ledger entry with `source='bank:manual'` exactly once (idempotent); admin-only guard; SMS-stub fired (vitest, test-first)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
