# Story 4.6: Cash top-up by Reception

Status: ready-for-dev

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

- [ ] Task 1: Implement cash adapter in `packages/payments` (AC: #2)
  - [ ] `packages/payments/src/cash/topup.ts` — conform to unified Charge interface; map to `wallet.post(topup)` with `source='cash:reception'`, `posted_by`
- [ ] Task 2: Add cash top-up route in `apps/api` (AC: #1, #2)
  - [ ] `apps/api/src/routes/payments/cash/topup.ts`; role-guard to Reception via `@bm/auth`; validate amount
  - [ ] Call `@bm/wallet` `wallet.post(topup)` → `wallet_ledger` with `kind='topup'`, `source='cash:reception'`, `posted_by=reception_user_id`; write audit to `audit_outbox`
- [ ] Task 3: Build Reception cash top-up UI in `apps/admin` (AC: #1)
  - [ ] Select parent → "Cash top-up" → enter amount → confirm flow
- [ ] Task 4: Receipt + notification (AC: #3)
  - [ ] Trigger receipt print; send `@bm/sms` stub notification to parent
- [ ] Task 5: Tests (AC: all)
  - [ ] Unit/integration: ledger entry written with correct `kind`/`source`/`posted_by`; Reception-only role guard enforced; receipt + SMS-stub fired (vitest, test-first)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
