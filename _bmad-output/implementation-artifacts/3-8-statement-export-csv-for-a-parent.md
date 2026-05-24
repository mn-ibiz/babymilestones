# Story 3.8: Statement export (CSV) for a parent

Status: ready-for-dev

> Canonical ID: P1-E03-S08 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S08.md

## Story

As a parent,
I want to download my wallet statement for a date range,
so that I have a record of my transactions for my own books.

## Acceptance Criteria

1. Date-range CSV: timestamp, kind, direction, amount, balance after, reference.
2. Available from parent dashboard and admin Reception screen.
3. Generated synchronously for ranges ≤ 12 months; async otherwise.

## Tasks / Subtasks

- [ ] Task 1: Implement statement generation (AC: #1)
  - [ ] `packages/wallet/statement.ts`: query `wallet_ledger` for a wallet over a date range ordered chronologically; emit CSV columns `timestamp, kind, direction, amount, balance after, reference`, computing running balance-after from the ledger (amounts as integer cents formatted consistently).
- [ ] Task 2: Sync vs async dispatch (AC: #3)
  - [ ] For ranges ≤ 12 months generate synchronously and return the CSV; for longer ranges enqueue an async job (register via `apps/jobs/src/registry.ts`) and return a deferred result/handle.
- [ ] Task 3: Expose endpoints (AC: #2)
  - [ ] Add statement export route(s) under `apps/api/src/routes/`; wire into the parent dashboard (`apps/platform`) and the admin Reception screen (`apps/admin`).
- [ ] Task 4: Tests (all)
  - [ ] Tests: CSV has exactly the required columns with a correct running balance-after (AC1); ≤ 12 months runs synchronously, > 12 months dispatches async (AC3); access works from both parent and Reception surfaces with proper scoping (AC2).

## Dev Notes

- Balance-after column is derived from the ledger running total (consistent with story 3.2 — balance is computed, never stored). Amounts are integer cents.
- The ≤ 12-month threshold is the sync/async cutoff; long ranges go through the `apps/jobs` worker to avoid blocking requests.
- Lives in `packages/wallet/statement.ts` (generation), `apps/api/src/routes/` (endpoints), `apps/platform` + `apps/admin` (download UI), `apps/jobs/src/registry.ts` (async job).
- Testing standards: vitest, test-first; column correctness and the sync/async boundary are the key assertions.

### Project Structure Notes
- `packages/wallet/statement.ts`; `apps/api/src/routes/` export endpoint; UI hooks in `apps/platform` and `apps/admin`; async job in `apps/jobs`.
- Depends on P1-E03-S01 (ledger) and P1-E03-S02 (computed balance).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S08.md]
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
