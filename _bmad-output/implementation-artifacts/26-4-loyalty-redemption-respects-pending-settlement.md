# Story 26.4: Loyalty redemption respects pending settlement

Status: done

> Canonical ID: P3-E04-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S04.md

## Story

As the system, I must not let parents redeem points that are about to be clawed back.

## Acceptance Criteria

1. At redemption, `available_to_redeem = balance − points_pending_clawback`.
2. Pending clawback set when a refund is initiated but not yet finalised (rare; admin workflow).
3. UI shows available-to-redeem, not raw balance, on the redeem screen.

## Tasks / Subtasks

- [x] Task 1: Implement Loyalty redemption respects pending settlement (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `availableToRedeemFor` computes `balance − Σ pending_clawback` (never < 0) via the pure `availableToRedeem` contract helper; `redeemPoints` refuses any redemption exceeding it.
  - [x] Satisfy AC#2: `markPendingClawback` provisions a pending amount when a refund is initiated-but-not-finalised — a NEW append-only zero-`points_delta` `loyalty_ledger` row carrying a positive `pending_clawback` (so the raw balance is untouched, only available drops). Idempotent per refund. Finalisation (`clawbackForRefund`, S01) now posts the real negative `points_delta` AND a negative `pending_clawback` that offsets the provision, so `Σ pending` nets to zero and the reduction is realised exactly once.
  - [x] Satisfy AC#3: The redeem surface consumes `availableToRedeemFor` / the `availableToRedeem` pure helper rather than the raw balance. (The parent-facing P2-E05 redemption UI/engine is not present on this branch — same scoping as S01/S02 — so the available-to-redeem value is exposed at the service + contracts layer the UI binds to.)
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: 6 integration tests (`packages/wallet/src/loyalty-redeem.test.ts`, real PGlite) covering pending-reduces-available-not-balance, floor-at-zero, the zero-delta provisional row, per-refund idempotency, and finalise-clears-pending; plus the pure `availableToRedeem` + `sumPendingClawback` unit tests in `packages/contracts/src/loyalty.test.ts`.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P2-E05-S03. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run` → 95/95 pass (incl. 6 in `loyalty-redeem.test.ts`).
- `pnpm -C packages/contracts exec vitest run` → 119/119 pass (incl. availableToRedeem + sumPendingClawback).
- `tsc --noEmit` green: contracts, wallet, db, auth, api.

### Completion Notes List

- No new migration — reuses the `pending_clawback` column added with the Epic-26 ledger bootstrap (migration 0085). Additive-only honoured.
- Pending is modelled append-only: a provision is a zero-`points_delta` row (positive `pending_clawback`); finalisation posts the real negative `points_delta` plus a negative `pending_clawback` that nets the provision to zero. The balance never double-counts the reduction.
- `availableToRedeem(balance, pending)` (contracts) floors at zero so a pending exceeding the balance offers 0, never a negative.
- Redemption is guarded: `redeemPoints` throws when the requested points exceed available-to-redeem.

### File List

- packages/wallet/src/loyalty-redeem.ts (new — availableToRedeemFor, markPendingClawback, redeemPoints)
- packages/wallet/src/loyalty-redeem.test.ts (new — 6 integration tests)
- packages/wallet/src/loyalty-clawback.ts (finalisation offsets the provisioned pending)
- packages/wallet/src/index.ts (re-export the redemption API)
- packages/contracts/src/index.ts (availableToRedeem + sumPendingClawback — from 26-3)
- packages/contracts/src/loyalty.test.ts (availableToRedeem + sumPendingClawback unit tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Redemption respects pending settlement: pending provision + finalise-offset, available-to-redeem guard, integration + pure-math tests. Green. | Claude Opus 4.8 |
