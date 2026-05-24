# Story 5.5: Recent transactions panel

Status: ready-for-dev

> Canonical ID: P1-E05-S05 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S05.md

## Story

As Reception,
I want to see a parent's last 10 transactions,
so that I can answer "did this go through?".

## Acceptance Criteria

1. Panel below header; latest 10 ledger entries with date, kind, amount, balance after.
2. "View full statement" link → P1-E03-S08 export.

## Tasks / Subtasks

- [ ] Task 1: Recent-transactions contract (AC: #1)
  - [ ] Add recent-ledger Zod schema in `packages/contracts` (entry: date, kind, amount, balance_after)
- [ ] Task 2: Recent-transactions endpoint (AC: #1)
  - [ ] `apps/api/src/routes/reception/recent-transactions.ts` — return latest 10 ledger entries for a parent via `@bm/wallet` (date, kind, amount, running balance after)
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
- [ ] Task 3: Transactions panel UI (AC: #1, #2)
  - [ ] `apps/admin` Reception — panel below `<ParentHeader>` listing the 10 entries; "View full statement" link → P1-E03-S08 export
- [ ] Task 4: Tests per source "Tests" section (AC: all)
  - [ ] Unit: limit-10 ordering, balance-after computation (vitest, test-first)
  - [ ] Integration: endpoint returns latest 10 with correct fields
  - [ ] E2E: panel renders under header; statement link routes to export

## Dev Notes

- Read-only view over the wallet ledger (`@bm/wallet`); show the running balance after each entry, newest first, capped at 10.
- "View full statement" reuses the P1-E03-S08 export rather than re-implementing it.
- Source paths to touch: `apps/api/src/routes/reception/recent-transactions.ts`, `apps/admin` Reception panel, `packages/contracts` (recent-ledger schema), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; panel in `apps/admin` rendered below the ParentHeader compound from S02.
- Dependency (from source): S02 (profile/header context). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S05.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
