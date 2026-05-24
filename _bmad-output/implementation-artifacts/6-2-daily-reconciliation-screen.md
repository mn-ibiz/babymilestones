# Story 6.2: Daily reconciliation screen

Status: ready-for-dev

> Canonical ID: P1-E06-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S02.md

## Story

As admin,
I want to see at-a-glance whether customer wallet liability matches the float in our accounts,
so that I can catch drift before it becomes a loss.

## Acceptance Criteria

1. One screen, three columns: float account name, system-tracked balance, real-world balance (manual input today, API in P5).
2. Drift column: `system − real`; > KES 100 → red banner.
3. "Add adjusting entry" CTA opens a form: amount, account, reason, posted by, dual-approval (admin + treasury role).
4. All adjustments audited; reversing-entry pattern.

## Tasks / Subtasks

- [ ] Task 1: Reconciliation schema (AC: #3, #4)
  - [ ] Additive migration in `packages/db` — adjusting-entry table (amount, float_account_id, reason, posted_by, approved_by, status) supporting reversing-entry pattern
- [ ] Task 2: Reconciliation read model (AC: #1, #2)
  - [ ] `apps/api/src/routes/treasury/reconciliation.ts` — per float account: system balance = `SUM(wallet_ledger.amount)` grouped by `float_account_id`; accept manual real-world balance; compute drift = system − real
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
- [ ] Task 3: Adjusting-entry contract + route (AC: #3, #4)
  - [ ] Add adjusting-entry Zod schema in `packages/contracts` (amount, account, reason, posted_by)
  - [ ] Endpoint to create adjusting entry (posted) and to approve it — dual-approval (admin posts, treasury role approves) via `@bm/auth`; never delete, post reversing entries; write `audit_outbox` per action
- [ ] Task 4: Reconciliation UI (AC: #1, #2, #3)
  - [ ] `apps/admin` Treasury — three-column screen; manual real-balance input; red banner when any drift > KES 100; "Add adjusting entry" form with dual-approval flow
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: liability grouping, drift calc, >KES 100 banner threshold, reversing-entry math (vitest, test-first)
  - [ ] Integration: reconciliation read model; adjusting entry requires dual-approval; all adjustments audited
  - [ ] E2E: drift triggers red banner; post + approve an adjusting entry

## Dev Notes

- `customer_wallet_liability = SUM(wallet_ledger.amount)` grouped by `float_account_id` — drives the system-tracked balance column.
- Real-world balance is manual input in P1 (live API arrives in P5); leave the input pluggable.
- Drift = system − real; any account drifting more than KES 100 raises a red banner.
- Adjustments use a reversing-entry pattern (never mutate/delete prior entries) and require dual-approval (admin + treasury role, see P1-E06-S03); every adjustment is audited.
- Source paths to touch: `apps/api/src/routes/treasury/reconciliation.ts`, `apps/admin` Treasury reconciliation screen, `packages/db` (adjusting-entry migration), `packages/contracts` (adjusting-entry schema), `@bm/auth` (dual-approval roles), `@bm/wallet`.
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Read model + adjustment routes in `apps/api/src/routes/treasury/`; UI in `apps/admin`; schema in `packages/db`.
- Dependencies (from source): S01 (float accounts), P1-E03 (wallet ledger). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E06.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
