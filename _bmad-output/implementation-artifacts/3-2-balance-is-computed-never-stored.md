# Story 3.2: Balance is computed, never stored

Status: done

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

- [x] Task 1: Add the balance index (AC: #3)
  - [x] Migration `0012_wallet_ledger_balance_index.sql` adding index on `wallet_ledger (wallet_id, created_at DESC)`; additive-only. Mirrored in the Drizzle schema.
  - [x] Confirmed the `wallets` table has NO `balance` column (AC2) — schema reviewed in `packages/db/src/schema/wallets.ts`; asserted by test.
- [x] Task 2: Implement `wallet.balance(walletId)` (AC: #1)
  - [x] Added `balance()` (and batched `balances()`) to `packages/wallet` running `SELECT COALESCE(SUM(amount), 0) FROM wallet_ledger WHERE wallet_id = ?`, returns integer cents (0 when no rows).
- [x] Task 3: Tests (AC: #1, #4, all)
  - [x] Unit test: known set of postings → expected SUM.
  - [x] Property test: 1000 random signed postings (deterministic LCG PRNG, no extra dep), assert `balance()` equals a naive in-memory sum.
  - [x] Schema test asserting no `wallets.balance` column exists; plus an index-existence test (AC3).

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

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Wallet suite: 8 tests pass incl. the 1000-posting property test.
- Fixes during gate: added `drizzle-orm` as a direct dep of `@bm/wallet` (was failing to resolve under pnpm); replaced a precision-losing PRNG seed literal (lint `no-loss-of-precision`).

### Completion Notes List

- Balance is computed as `COALESCE(SUM(amount), 0)` over `wallet_ledger`; no `wallets.balance` column exists (single source of truth, integer cents, no float drift).
- `balance(db, walletId)` and batched `balances(db, walletIds)` added to `@bm/wallet`; both accept a `Database` or `Transaction` handle.
- Added composite index `wallet_ledger_wallet_id_created_at_idx (wallet_id, created_at DESC)` in migration 0012 and mirrored in the Drizzle schema.
- One review pass; no blocker/high findings. Low-severity follow-ups in `3-2-balance-is-computed-never-stored-review-findings.md`.

### File List

- `packages/wallet/src/index.ts` (modified — `balance`/`balances`)
- `packages/wallet/src/balance.test.ts` (added)
- `packages/wallet/package.json` (modified — `drizzle-orm` dep)
- `packages/db/migrations/0012_wallet_ledger_balance_index.sql` (added)
- `packages/db/src/schema/wallet-ledger.ts` (modified — index)
- `_bmad-output/implementation-artifacts/3-2-balance-is-computed-never-stored-review-findings.md` (added)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented computed balance primitive + index migration + tests; gate green; status done | claude-opus-4-7 |
