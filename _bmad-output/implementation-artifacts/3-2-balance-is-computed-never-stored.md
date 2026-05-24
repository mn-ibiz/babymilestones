# Story 3.2: Balance is computed, never stored

Status: ready-for-dev

> Canonical ID: P1-E03-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S02.md

## Story

As a developer,
I want one source of truth for wallet balance computed from the ledger,
so that reconciliation is trivial and balances can never drift from postings.

## Acceptance Criteria

1. `wallet.balance(walletId)` = `SELECT SUM(amount) FROM wallet_ledger WHERE wallet_id = ?`.
2. No `wallets.balance` column.
3. Index `(wallet_id, created_at DESC)` exists.
4. Property test: 1000 random postings → balance equals naive sum.

## Tasks / Subtasks

- [ ] Task 1: Add the balance index (AC: #3)
  - [ ] Migration in `packages/db/migrations/` adding index on `wallet_ledger (wallet_id, created_at DESC)`; additive-only.
  - [ ] Confirm the `wallets` table has NO `balance` column (AC2) — schema review in `packages/db/src/schema/`.
- [ ] Task 2: Implement `wallet.balance(walletId)` (AC: #1)
  - [ ] Add `balance()` to `packages/wallet` that runs `SELECT SUM(amount) FROM wallet_ledger WHERE wallet_id = ?` and returns integer cents (0 when no rows).
- [ ] Task 3: Tests (AC: #1, #4, all)
  - [ ] Unit test: known set of postings → expected SUM.
  - [ ] Property test (`packages/wallet/__tests__/`): generate 1000 random signed postings, assert `balance()` equals a naive in-memory sum.
  - [ ] Schema test asserting no `wallets.balance` column exists.

## Dev Notes

- Balance is always derived via `SUM(amount)` over `wallet_ledger`; storing a balance column is forbidden (single source of truth eliminates reconciliation drift).
- Materialised view is explicitly deferred to P2 if perf demands it — do NOT add one in P1.
- Lives in `packages/wallet` (computation) + `packages/db` (index migration, `wallets`/`wallet_ledger` schema).
- Testing standards: vitest, test-first. The property test (1000 random postings vs naive sum) is the key correctness gate.

### Project Structure Notes
- `packages/wallet`: new `balance()` primitive. `packages/db`: new index migration; verify `wallets` schema has no balance column.
- Depends on P1-E03-S01 (the `wallet_ledger` table).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S02.md]
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
