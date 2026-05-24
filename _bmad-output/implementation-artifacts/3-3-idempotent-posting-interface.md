# Story 3.3: Idempotent posting interface

Status: done

> Canonical ID: P1-E03-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S03.md

## Story

As a developer integrating M-Pesa,
I want to call `wallet.post()` safely even if the network retries,
so that a retried request never double-posts to the ledger.

## Acceptance Criteria

1. `post({ walletId, amount, kind, idempotencyKey, source, postedBy })` returns the ledger row.
2. Same key called twice → returns the same row, no second posting (UNIQUE constraint catches it).
3. Conflict surfaced as `IdempotencyConflict` typed error for caller to handle.

## Tasks / Subtasks

- [x] Task 1: Implement `wallet.post()` primitive (AC: #1, #2)
  - [x] Add `post()` to `packages/wallet` taking `{ walletId, amount, kind, idempotencyKey, source, postedBy }`, inserting one `wallet_ledger` row inside a DB transaction, relying on the `idempotency_key` UNIQUE index for atomicity (`ON CONFLICT (idempotency_key) DO NOTHING`). `direction` is derived from the sign of `amount`.
  - [x] On duplicate key, fetch and return the existing row so the same key yields the same row with no second insert.
- [x] Task 2: Typed conflict error (AC: #3)
  - [x] Define `IdempotencyConflict` error (carries `idempotencyKey` + `existing` row); surface it when a true semantic conflict is detected (same key, different payload), else return the prior row. Exported from `packages/wallet`.
- [x] Task 3: Tests (AC: #2, #3, all)
  - [x] Unit test: same key twice → identical row, exactly one ledger insert.
  - [x] Concurrency test (per source Tests): fire 100 concurrent posts of the same key → exactly 1 row persists.
  - [x] Test that a conflicting payload on an existing key raises `IdempotencyConflict`.

## Dev Notes

- Idempotency is enforced by the DB UNIQUE index on `idempotency_key` (from P1-E03-S01), not by application-level locking — wrap the insert in a transaction and let the constraint arbitrate races.
- This is the safe entry point for retryable callers (M-Pesa/Paystack webhooks in `packages/payments`).
- Lives in `packages/wallet`; consumes the `wallet_ledger` table in `packages/db`.
- Testing standards: vitest, test-first. The 100-concurrent-posts test (exactly 1 row) is the critical race-condition gate.

### Project Structure Notes
- `packages/wallet`: new `post()` primitive + `IdempotencyConflict` error export.
- Depends on P1-E03-S01 (table + UNIQUE index) and P1-E03-S02 (balance source of truth).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E03]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` (test/typecheck/lint 15/15 packages, build 5/5). Wallet package: 15 tests pass including the 100-concurrent-posts race gate (exactly 1 row).

### Completion Notes List

- `post(db, { walletId, amount, kind, idempotencyKey, source, postedBy })` inserts one `wallet_ledger` row inside a transaction using `onConflictDoNothing({ target: idempotencyKey })`; the DB UNIQUE index arbitrates concurrent races (no app-level locking).
- `direction` is derived from the sign of `amount` (credit ≥ 0, debit < 0), so callers do not pass it.
- On conflict: same payload → returns the pre-existing row (benign retry, no second insert); different payload → throws typed `IdempotencyConflict` (carries `idempotencyKey` + `existing` row).
- Review: one pass, no blocker/high findings, none deferred.

### File List

- packages/wallet/src/index.ts (modified — added `PostInput`, `IdempotencyConflict`, `post()`)
- packages/wallet/src/post.test.ts (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented idempotent `post()` + `IdempotencyConflict`, test-first incl. 100-concurrent race gate; full gate green | claude-opus-4-7 |
