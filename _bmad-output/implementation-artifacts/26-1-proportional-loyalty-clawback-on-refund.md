# Story 26.1: Proportional loyalty clawback on refund

Status: done

> Canonical ID: P3-E04-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S01.md

## Story

As the system, when a refund happens, I must claw back the points that were earned on the refunded amount.

## Acceptance Criteria

1. When `wallet_ledger.kind='refund'` posts, compute the points that were earned on the original transaction (use `earn_rate` snapshot from that day).
2. Insert a `loyalty_ledger` debit with the proportional clawback amount and `reverses_loyalty_ledger_id` FK.
3. If the parent's points balance is sufficient → straightforward debit.
4. If insufficient → balance goes negative; flag `negative_carry=true` on the entry.
5. Decision refs: 22.

## Tasks / Subtasks

- [x] Task 1: Implement Proportional loyalty clawback on refund (AC: #1, #2, #3, #4, #5)
  - [x] Satisfy AC#1: Proportional points are recomputed from the earn's snapshot (`earnedPoints`, `originalMinor`) against the `refundedMinor` via the pure `loyaltyClawbackPoints` helper.
  - [x] Satisfy AC#2: `clawbackForRefund` appends a `loyalty_ledger` row `kind='clawback'`, negative `points_delta`, with `reverses_loyalty_ledger_id` FK to the earn and `source_wallet_ledger_id` to the refund.
  - [x] Satisfy AC#3: When the balance covers the clawback it is a straightforward debit (balance stays ≥ 0).
  - [x] Satisfy AC#4: When the balance is insufficient the balance goes negative and the clawback row is flagged `negative_carry=true`.
  - [x] Satisfy AC#5: Decision refs: 22 (append-only reversing entry, never mutate history).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: 11 wallet tests (`loyalty-clawback.test.ts`, real PGlite) + 24 pure-math contracts unit tests (`loyalty.test.ts`) — integer points, no float drift, idempotent on refund replay.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - P2-E05-S01 - P1-E03-S06
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run` → 118/118 pass (incl. 11 in `loyalty-clawback.test.ts`).
- `pnpm -C packages/contracts exec vitest run` → 295/295 pass (incl. 24 in `loyalty.test.ts`).
- `tsc --noEmit` green: contracts, auth, db, wallet.

### Completion Notes List

- Bootstrapped the append-only `loyalty_ledger` (Epic 26 owns migrations 0059–0061 on this branch — base only had through 0058, so 0079–0081 from the planning doc do not apply here; additive, sequential).
- Clawback is a NEW reversing entry (`kind='clawback'`, negative `points_delta`), never a mutation of the earn — append-only guard trigger forbids UPDATE/DELETE on the ledger.
- Proportional math is a pure integer helper (`loyaltyClawbackPoints`) — round-half-to-nearest in integer space, clamped to `[0, earned]`, no float drift.
- Idempotent on refund replay: a clawback already tied to the refund's `source_wallet_ledger_id` is never written twice.
- `negative_carry=true` flagged when the clawback drives the balance below zero; future earns repay it first (S02).
- Repaired a corrupted `packages/auth/src/audit-actions.ts` (duplicate keys + truncated tail from interrupted edits) and reconstructed it cleanly with the two Epic-26 keys (`loyalty.clawback`, `loyalty.adjust`).

### File List

- packages/db/migrations/0059_loyalty_ledger.sql (new)
- packages/db/migrations/0060_loyalty_negative_carry.sql (new)
- packages/db/migrations/0061_loyalty_pending_clawback.sql (new)
- packages/db/src/schema/loyalty-ledger.ts (new)
- packages/db/src/schema/index.ts (re-export loyalty-ledger)
- packages/contracts/src/index.ts (pure helpers: loyaltyClawbackPoints, splitEarnAgainstCarry, availableToRedeem, loyaltyAdjustmentDelta, sumPendingClawback)
- packages/contracts/src/loyalty.test.ts (new — 24 pure-math unit tests)
- packages/auth/src/audit-actions.ts (loyalty.clawback, loyalty.adjust)
- packages/wallet/src/loyalty.ts (new — earnPoints + loyaltyBalance foundation)
- packages/wallet/src/loyalty-clawback.ts (new — clawbackForRefund)
- packages/wallet/src/loyalty-clawback.test.ts (new — 11 tests, real PGlite)
- packages/wallet/src/index.ts (re-export loyalty engine)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented proportional clawback reversing entry + negative carry flag + idempotency; contracts pure-math unit tests; repaired audit-actions. Green. | Claude Opus 4.8 |
