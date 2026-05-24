# Story 6.1: Configure float accounts (per till / per bank)

Status: ready-for-dev

> Canonical ID: P1-E06-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S01.md

## Story

As admin,
I want to declare which accounts hold customer wallet float,
so that the system can reconcile against them.

## Acceptance Criteria

1. `float_accounts` table: name, kind (`mpesa_till` | `bank` | `cash_drawer`), opening balance, opening date.
2. Admin CRUD with audit.
3. Each top-up entry tags a `float_account_id` based on payment method.

## Tasks / Subtasks

- [ ] Task 1: Float accounts schema (AC: #1, #3)
  - [ ] Additive migration in `packages/db` — `float_accounts` (name, kind ∈ mpesa_till | bank | cash_drawer, opening_balance, opening_date)
  - [ ] Additive migration — add `wallet_ledger.float_account_id`; backfill historical entries to a "default" account at deploy (empty in P1)
- [ ] Task 2: Float account contract (AC: #1, #2)
  - [ ] Add float-account Zod schemas in `packages/contracts` (create/update payloads, kind enum)
- [ ] Task 3: Admin CRUD routes (AC: #2)
  - [ ] `apps/api/src/routes/treasury/float-accounts.ts` — create/read/update/delete float accounts; admin-guarded via `@bm/auth`; write `audit_outbox` row per mutation
  - [ ] Register route in `apps/api/src/app.ts` (buildApp)
- [ ] Task 4: Top-up tagging (AC: #3)
  - [ ] In wallet credit path (`@bm/wallet` / top-up route from P1-E05-S03), set `float_account_id` derived from payment method (cash→cash_drawer, M-Pesa→mpesa_till, bank→bank)
- [ ] Task 5: Admin CRUD UI (AC: #2)
  - [ ] `apps/admin` Treasury — list/create/edit/delete float accounts form
- [ ] Task 6: Tests per source "Tests" section (AC: all)
  - [ ] Unit: kind validation, method→float_account mapping (vitest, test-first)
  - [ ] Integration: CRUD with audit rows; top-up tags correct float_account_id; backfill default
  - [ ] E2E: create a float account in admin and see it listed

## Dev Notes

- Migration adds `wallet_ledger.float_account_id` and backfills historical entries to a "default" account at deploy time (will be empty in P1). Keep migrations additive-only.
- Top-up entries must be tagged with a `float_account_id` derived from payment method so reconciliation (P1-E06-S02) can group liability by account.
- All admin CRUD on float accounts is audited.
- Source paths to touch: `packages/db` (`float_accounts` + `wallet_ledger.float_account_id` migrations), `apps/api/src/routes/treasury/float-accounts.ts`, `apps/admin` Treasury CRUD, `packages/contracts` (float schemas), `@bm/wallet` (tagging), `@bm/auth` (admin guard).
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Schema in `packages/db`; routes in `apps/api/src/routes/treasury/`; UI in `apps/admin`.
- Dependencies (from source): P1-E03 (wallet ledger), P1-E10. Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S01.md]
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
