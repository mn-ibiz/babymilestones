# Story 20.2: Configurable earn and redeem rates

Status: done

> Canonical ID: P2-E05-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S02.md

## Story

As admin, I want to tune the loyalty programme without code changes.

## Acceptance Criteria

1. Settings: `earn_rate` (KES per point, default 100), `redeem_rate` (KES per point, default 1).
2. Changes are effective-dated; historical earnings/redemptions unchanged.
3. Decision refs: 11, 34.

## Tasks / Subtasks

- [x] Task 1: Implement Configurable earn and redeem rates (AC: #1, #2, #3)
  - [x] Satisfy AC#1: `earn_rate` (default 100) + `redeem_rate` (default 1), seeded in migration 0065.
  - [x] Satisfy AC#2: effective-dated `loyalty_rates` rows; `setRate` appends, never mutates — historical earn/redeem rows + their `rate_snapshot` are unchanged.
  - [x] Satisfy AC#3: Decision refs 11, 34 honoured (admin-tunable rates, no code change).
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest; 13 wallet tests (pure conversions + effective-dating + history immutability) and 6 admin-route tests.

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-E10-S04.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E05-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E05.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run src/loyalty-rates.test.ts` → 13/13 pass
- `pnpm -C apps/api exec vitest run src/routes/admin/loyalty-rates.test.ts` → 6/6 pass
- `pnpm -C packages/wallet exec vitest run` → 12 files / 97 tests pass
- `pnpm -C apps/api exec vitest run src/routes/admin` → 11 files / 120 tests pass
- `pnpm -C packages/db exec vitest run` → 10 files / 84 tests pass (migration 0065 applies cleanly)
- `pnpm -C {db,wallet,contracts} exec tsc --noEmit` + `pnpm -C apps/api exec tsc --noEmit` → clean

### Completion Notes List

- The existing `settings` table is single-row-per-key (key is the PK) and cannot hold effective-dated history, so a dedicated additive `loyalty_rates` table (migration 0065) was added for append-only effective-dated rows.
- **AC1** — defaults `earn_rate=100`, `redeem_rate=1` are seeded in the migration (effective at epoch) so `getEffectiveRates` always resolves even before an admin tunes anything.
- **AC2** — `setRate` only ever INSERTs a new effective-dated row; prior rows are never updated/deleted. `getEffectiveRates(at)` selects the latest row with `effective_from <= at` per type. Historical `loyalty_ledger` rows keep their `rate_snapshot` (verified by a test that earns under rate A, changes the rate, and asserts the prior earn row is unchanged).
- Pure conversion helpers `pointsForSpend` (floor of `spendCents / (earnRate*100)`) and `kesForPoints` (`points*redeemRate*100`) are integer-cents only — no float drift (tested on awkward values).
- Admin surface `GET/POST /admin/loyalty/rates` gated to `read`/`manage settings`; a non-admin (reception) is forbidden (403). Rate changes audited via `loyalty.rate_change`.
- Seed used two single-statement INSERTs (a multi-row VALUES was silently dropping the second row under the PGlite migration runner's simple-query splitting).

### File List

- packages/db/migrations/0065_loyalty_rates.sql (new)
- packages/db/src/schema/loyalty-rates.ts (new)
- packages/db/src/schema/index.ts (re-export)
- packages/wallet/src/loyalty-rates.ts (new — getEffectiveRates/setRate/pointsForSpend/kesForPoints + defaults)
- packages/wallet/src/loyalty-rates.test.ts (new — 13 tests)
- packages/wallet/src/index.ts (re-export)
- apps/api/src/routes/admin/loyalty-rates.ts (new — GET/POST /admin/loyalty/rates)
- apps/api/src/routes/admin/loyalty-rates.test.ts (new — 6 tests)
- apps/api/src/routes/admin/index.ts (register route)
- packages/contracts/src/index.ts (appended Loyalty section — rates/quote/redeem/history types)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Effective-dated loyalty rates + admin API; 19 tests pass | Amelia (Dev) |
