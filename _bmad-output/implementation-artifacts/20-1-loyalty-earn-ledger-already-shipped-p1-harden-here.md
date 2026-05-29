# Story 20.1: Loyalty earn ledger (already shipped P1, harden here)

Status: done

> Canonical ID: P2-E05-S01 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S01.md

## Story

As developer,
I want loyalty earnings to be auditable and reconcilable,
so that the capability described above is delivered.

## Acceptance Criteria

1. `loyalty_ledger` rows for every settled payment per Decision 21.
2. Each row references the `wallet_ledger` entry that triggered it.
3. Earn-rate snapshot stored on the row to survive future rate changes.

## Tasks / Subtasks

- [x] Task 1: Implement Loyalty earn ledger (built canonical hardened ledger here) (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `loyalty_ledger` rows written for settled payments via `earnPoints`.
  - [x] Satisfy AC#2: `wallet_ledger_entry_id` FK references the wallet_ledger entry that triggered the earn.
  - [x] Satisfy AC#3: `rate_snapshot` column stores the earn rate in force — survives future rate changes.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; 9 PGlite tests cover each AC (idempotency, positive-int guard, derived balance, history, audit).

## Dev Notes

Tidy up the earn path written in P1.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1 loyalty plumbing.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run src/loyalty.test.ts` → 9/9 pass
- `pnpm -C packages/wallet exec vitest run` (full suite) → 11 files / 84 tests pass
- `pnpm -C packages/db exec vitest run` → 10 files / 84 tests pass (migration 0064 applies cleanly)
- `pnpm -C packages/auth exec vitest run` → 104 tests pass (catalogue completeness)
- `pnpm -C {db,wallet,auth} exec tsc --noEmit` → clean (0 errors)

### Completion Notes List

- On this worktree branch (HEAD 6b3fad3, latest migration 0054) NO prior loyalty code existed — the "already shipped P1" earn ledger was not present, so the canonical hardened ledger was built here per the ACs.
- `loyalty_ledger` is **append-only**: the only write path is INSERT (idempotent on `idempotency_key`). No update/delete code exists.
- **Balance is DERIVED** via `SUM(CASE direction)` — there is no mutable cached points column that could drift.
- **AC2** — `wallet_ledger_entry_id` FK on every earn row references the triggering `wallet_ledger` entry.
- **AC3** — `rate_snapshot` stores the earn rate (KES/point) in force at write time, so a later rate change (20-2) never rewrites historical points.
- **Idempotency** — `earnPoints` short-circuits on an existing `idempotency_key` inside the same transaction; the UNIQUE constraint is the durable backstop against concurrent double-earn.
- Positive-integer guard (`assertPositivePoints`) throws BEFORE any write (zero/negative/fractional all rejected, no row inserted).
- A `BIGSERIAL seq` column gives a strict monotonic newest-first order for history (timestamp ties not relied on).
- Earn audits via `loyalty.earn` (new catalogue group `loyalty`).

### File List

- packages/db/migrations/0064_loyalty_ledger.sql (new)
- packages/db/src/schema/loyalty.ts (new)
- packages/db/src/schema/index.ts (re-export)
- packages/wallet/src/loyalty.ts (new — earnPoints/getLoyaltyBalance/getLoyaltyTotals/getLoyaltyHistory/assertPositivePoints)
- packages/wallet/src/loyalty.test.ts (new — 9 tests)
- packages/wallet/src/index.ts (re-export)
- packages/auth/src/audit-actions.ts (added loyalty group: loyalty.earn/redeem/rate_change)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Built hardened append-only loyalty earn ledger; 9 tests pass | Amelia (Dev) |
