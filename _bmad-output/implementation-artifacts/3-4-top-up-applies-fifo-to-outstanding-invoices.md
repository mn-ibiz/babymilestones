# Story 3.4: Top-up applies FIFO to outstanding invoices, residual to wallet

Status: ready-for-dev

> Canonical ID: P1-E03-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S04.md

## Story

As a parent settling a debt,
I want my top-up to clear the oldest invoice first, then leave the rest as wallet balance,
so that outstanding amounts are paid down predictably and any surplus stays available.

## Acceptance Criteria

1. Order of outstanding invoices: oldest `created_at` first.
2. Each invoice settled until either invoice is closed or top-up is exhausted.
3. Partial settlement allowed: invoice remains open with reduced `amount_due`.
4. Three canonical test cases pass: (top-up 2000 / owed 800 → wallet=1200, invoice closed); (top-up 500 / owed 800 → wallet=0, invoice partial 300 left); (top-up 2000 / owed [500,400,200] → wallet=900, all closed).
5. Each settlement writes a `wallet_ledger` row + `wallet_ledger_invoice_settlement` linkage row.

## Tasks / Subtasks

- [ ] Task 1: Add `wallet_ledger_invoice_settlement` linkage table (AC: #5)
  - [ ] Migration in `packages/db/migrations/` for `wallet_ledger_invoice_settlement` linking a `wallet_ledger` entry to an `invoice` with the settled amount (integer cents); additive-only.
- [ ] Task 2: Implement FIFO settlement (AC: #1, #2, #3, #5)
  - [ ] `packages/wallet/settle.ts`: load outstanding invoices for the parent ordered by `created_at` ASC; apply the top-up sequentially, closing each invoice or reducing `amount_due` on partial; stop when top-up exhausted.
  - [ ] For each settlement, write a `wallet_ledger` row (via `post()`) plus a `wallet_ledger_invoice_settlement` linkage row; persist residual as wallet balance (a remaining credit ledger entry / no further settlement).
  - [ ] Run the entire top-up + settlement sequence inside ONE DB transaction.
- [ ] Task 3: Tests (AC: #4, all)
  - [ ] `packages/wallet/__tests__/topup-settlement.test.ts` written BEFORE implementation, covering the three canonical cases in AC4 plus partial-settlement (AC3) and oldest-first ordering (AC1).
  - [ ] Assert each settlement produced both a ledger row and a linkage row (AC5).

## Dev Notes

- FIFO = oldest `created_at` invoice first; surplus after all invoices closed remains as wallet balance (computed via SUM, never stored).
- Atomicity: the full top-up-and-settle operation is a single DB transaction so partial failures can't leave invoices half-settled.
- Every settlement is double-recorded: a `wallet_ledger` posting AND a `wallet_ledger_invoice_settlement` linkage row.
- Lives in `packages/wallet/settle.ts`; new linkage table + `invoices` in `packages/db`.
- Testing standards: vitest, strictly test-first — the test file is named in the source and must precede implementation. The three canonical math cases are the acceptance gate.

### Project Structure Notes
- `packages/wallet/settle.ts` + `packages/wallet/__tests__/topup-settlement.test.ts`. `packages/db`: `wallet_ledger_invoice_settlement` migration.
- Depends on P1-E03-S01 (ledger) and P1-E02-S03 (invoices / parent account).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S04.md]
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
