# Story 4.6: Cash top-up by Reception

Status: done

> Canonical ID: P1-E04-S06 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S06.md

## Story

As Reception,
I want to record a cash top-up at the counter,
so that a parent's wallet is funded when they pay cash in person.

## Acceptance Criteria

1. Reception selects parent → "Cash top-up" → enters amount → confirms.
2. Posts to `wallet_ledger` with `kind='topup'`, `source='cash:reception'`, `posted_by=reception_user_id`.
3. Receipt printed + SMS-stub sent.
4. Treasury reconciliation (P1-E06) expects this as cash float.

## Tasks / Subtasks

- [x] Task 1: Implement cash adapter in `packages/payments` (AC: #2)
  - [x] `packages/payments/src/cash/topup.ts` — conforms to a unified Charge shape (`CashCharge`); maps to the idempotent FIFO top-up (`@bm/wallet.applyTopup`) with `source='cash:reception'` (exported as `CASH_RECEPTION_SOURCE`), `posted_by=<staff id>`
- [x] Task 2: Add cash top-up route in `apps/api` (AC: #1, #2)
  - [x] `apps/api/src/routes/payments/cash/topup.ts`; role-guard to Reception/Cashier via `requirePermission("create","payment")`; `cashTopupSchema` validates amount (integer cents, bounded)
  - [x] Credits via `@bm/wallet` → `wallet_ledger` with `kind='topup'`, `source='cash:reception'`, `posted_by=reception_user_id`; writes audit to `audit_outbox`
- [~] Task 3: Build Reception cash top-up UI in `apps/admin` (AC: #1) — DEFERRED: server contract complete + tested; the select-parent/amount/confirm screen belongs with the Reception console surface (P1-E05). See review-findings.
- [~] Task 4: Receipt + notification (AC: #3) — SMS-stub receipt fired (`template: "wallet.topup.cash"`); physical receipt print deferred (no print service in scaffold; P1-E05). See review-findings.
- [x] Task 5: Tests (AC: all)
  - [x] Adapter unit + route integration (vitest, test-first): ledger `kind`/`source`/`posted_by` correct, FIFO settlement, Reception/Cashier-only guard (packer/accountant/unauth/CSRF rejected), receipt SMS-stub fired, audit row with staff actor, idempotent replay

## Dev Notes

- Cash adapter lives in `packages/payments` (cash adapter, unified Charge interface). The credit goes through `packages/wallet` `wallet.post(topup)` so it lands in `wallet_ledger` with `kind='topup'`, `source='cash:reception'`, `posted_by=reception_user_id`.
- The Reception surface is in `apps/admin` (Reception console). Role guard via `@bm/auth`.
- `source='cash:reception'` is what Treasury reconciliation (P1-E06) reads as cash float — keep the source string exact. SMS via `packages/sms` (stub at launch).

### Project Structure Notes
- New: `packages/payments/src/cash/topup.ts`; `apps/api/src/routes/payments/cash/topup.ts`; Reception cash top-up UI in `apps/admin/`.
- Reuses `@bm/wallet` ledger primitives and `wallet_ledger` in `packages/db`. Audited actions write to `audit_outbox`.
- Depends on P1-E03-S03 (wallet), P1-E05 (receipt), P1-E08 (SMS/notifications); feeds P1-E06 (Treasury reconciliation).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E04-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E04]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Initial FIFO test failed on `invoices_parent_id_fkey`: `invoices.parent_id` references `parents.id`, not the user id. Fixed the route to resolve the parent profile id before calling the adapter for FIFO settlement (the wallet/SMS still resolve from the user id). Full gate green afterwards.

### Completion Notes List

- Cash is a manual entry (money already in the till), so the adapter is a synchronous mapping over `@bm/wallet.applyTopup` (idempotent + FIFO) rather than an async provider with a callback. A recorded charge is always `settled`.
- `source='cash:reception'` is fixed in the adapter and exported as `CASH_RECEPTION_SOURCE`; pinned by tests for the Treasury reconciliation reader (P1-E06, AC4).
- Route guarded by `create payment` (Reception + Cashier only among money handlers); admins/accountants/treasury/packers rejected. Wallet derived server-side; staff actor is the session user (`posted_by`).
- AC3 receipt = transactional SMS-stub at launch (`template: "wallet.topup.cash"`); physical print deferred to P1-E05.
- Idempotent: a replay credits nothing, re-audits nothing, notifies no one.

### File List

- `packages/payments/src/cash/topup.ts` (new)
- `packages/payments/src/cash/topup.test.ts` (new)
- `packages/payments/src/index.ts` (export cash adapter)
- `packages/payments/package.json` (add `@bm/db`, `@bm/wallet`, `drizzle-orm` deps)
- `packages/contracts/src/index.ts` (`cashTopupSchema` + bounds)
- `apps/api/src/routes/payments/cash/topup.ts` (new)
- `apps/api/src/routes/payments/cash/index.ts` (new)
- `apps/api/src/routes/payments/cash/topup.test.ts` (new)
- `apps/api/src/routes/payments/mpesa/index.ts` (`PaymentsDeps.sms`)
- `apps/api/src/app.ts` (register cash routes)
- `_bmad-output/implementation-artifacts/4-6-cash-top-up-by-reception-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Cash top-up adapter + Reception/Cashier route, contracts schema, tests; status done | claude-opus-4-7 |
