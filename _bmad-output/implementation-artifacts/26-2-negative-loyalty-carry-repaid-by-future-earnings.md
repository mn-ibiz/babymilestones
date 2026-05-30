# Story 26.2: Negative-loyalty carry repaid by future earnings

Status: done

> Canonical ID: P3-E04-S02 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S02.md

## Story

As the system, future loyalty earnings should first repay any negative balance before adding to spendable points.

## Acceptance Criteria

1. When a new earn entry posts, if balance is negative, apply earned points to bring balance back up to 0 first; remainder is spendable.
2. The earn ledger row tags `applied_to_negative_carry` portion separately for traceability.

## Tasks / Subtasks

- [x] Task 1: Implement Negative-loyalty carry repaid by future earnings (AC: #1, #2)
  - [x] Satisfy AC#1: `earnPoints` reads the current balance; when negative, the pure `splitEarnAgainstCarry` helper applies the earn to the deficit first (up to the earn amount) and the remainder is spendable. The single earn row credits the FULL points so the balance recovers (append-only).
  - [x] Satisfy AC#2: The earn row tags the `applied_to_negative_carry` portion separately for traceability.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: 5 integration tests (`loyalty-carry.test.ts`, real PGlite) covering earn < / = / > carry, no-carry, and successive earns; plus the pure-math `splitEarnAgainstCarry` unit tests in `contracts/src/loyalty.test.ts` (integer, sum-invariant, no drift).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E04-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E04.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- `pnpm -C packages/wallet exec vitest run` → green (incl. 5 in `loyalty-carry.test.ts`).
- `tsc --noEmit` green: wallet, contracts.

### Completion Notes List

- The earn primitive (`earnPoints`, S01 foundation) already credits the full points and recovers a negative balance; S02 adds the traceability split via `splitEarnAgainstCarry` and the `applied_to_negative_carry` tag (column from migration 0060).
- Pure-math (`splitEarnAgainstCarry`) keeps carry + spendable summing exactly to the earn — integer, no float drift.
- No new migration (column 0060 was added with the Epic-26 ledger bootstrap); additive-only honoured.

### File List

- packages/wallet/src/loyalty.ts (earnPoints carry split — foundation from 26-1)
- packages/contracts/src/index.ts (splitEarnAgainstCarry — from 26-1)
- packages/wallet/src/loyalty-carry.test.ts (new — 5 integration tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Negative carry repaid first on earn; applied_to_negative_carry tag; integration tests. Green. | Claude Opus 4.8 |
