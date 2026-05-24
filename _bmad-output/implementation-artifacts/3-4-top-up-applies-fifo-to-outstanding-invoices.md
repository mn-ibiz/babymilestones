# Story 3.4: Top-up applies FIFO to outstanding invoices, residual to wallet

Status: done

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

- [x] Task 1: Add `wallet_ledger_invoice_settlement` linkage table (AC: #5)
  - [x] Migration `0013_invoices_settlement.sql` for `invoices` + `wallet_ledger_invoice_settlement` linking a `wallet_ledger` entry to an `invoice` with the settled amount (integer cents); additive-only. Drizzle schema added for both tables and exported from the barrel.
- [x] Task 2: Implement FIFO settlement (AC: #1, #2, #3, #5)
  - [x] `packages/wallet/src/settle.ts`: load outstanding invoices for the parent ordered by `created_at` ASC (tie-broken by id); apply the top-up sequentially, closing each invoice or reducing `amount_due` on partial; stop when top-up exhausted.
  - [x] Each settlement writes its OWN `wallet_ledger` debit row plus a `wallet_ledger_invoice_settlement` linkage row; residual is the wallet balance (credit − settlement debits, SUM-derived, never stored).
  - [x] Entire top-up + settlement sequence runs inside ONE DB transaction; idempotent via the credit's `idempotency_key` (replay short-circuits).
- [x] Task 3: Tests (AC: #4, all)
  - [x] `packages/wallet/__tests__/topup-settlement.test.ts` written BEFORE implementation, covering the three canonical cases in AC4 plus partial-settlement (AC3), oldest-first ordering with out-of-order inserts (AC1), idempotent replay, no-invoice residual, and cross-parent isolation.
  - [x] Asserts each settlement produced both a ledger row and a linkage row (AC5).

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

claude-opus-4-7

### Debug Log References

- Initial test run surfaced the balance model: posting only the top-up credit left balance = full top-up, not residual. Resolved by posting a per-settlement `wallet_ledger` debit (kind `debit`), so balance (credit − debits) equals the residual and AC5's "ledger row per settlement" is satisfied directly.

### Completion Notes List

- `invoices` modelled per-parent (`parent_id` FK), `amount_due` integer cents (CHECK >= 0), `status` pending|settled, `created_at`/`updated_at`. FIFO index `(parent_id, created_at)`.
- `wallet_ledger_invoice_settlement` links a `wallet_ledger` entry to an invoice with the settled `amount` (CHECK > 0).
- `applyTopup()` is the single entry point: one transaction posts the credit once (idempotent via unique `idempotency_key`), then settles oldest-first, posting a debit + linkage row per invoice and reducing/closing each invoice. Residual remains as wallet balance (SUM-derived).
- Settlement debit idempotency keys derived as `${key}:settle:${invoiceId}` for defence-in-depth; the replay guard short-circuits before reaching them.
- Self-review: no BLOCKER/high findings; all 5 ACs covered by passing tests. Full gate green (test/typecheck/lint/build).

### File List

- packages/db/migrations/0013_invoices_settlement.sql (new)
- packages/db/src/schema/invoices.ts (new)
- packages/db/src/schema/wallet-ledger-invoice-settlement.ts (new)
- packages/db/src/schema/index.ts (modified — barrel exports)
- packages/wallet/src/settle.ts (new)
- packages/wallet/src/index.ts (modified — re-export applyTopup)
- packages/wallet/__tests__/topup-settlement.test.ts (new)
- packages/wallet/tsconfig.json (modified — include __tests__)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | FIFO top-up settlement implemented test-first; invoices + linkage tables; gate green | claude-opus-4-7 |
