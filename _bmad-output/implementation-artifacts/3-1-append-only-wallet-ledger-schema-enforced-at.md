# Story 3.1: Append-only `wallet_ledger` schema enforced at DB level

Status: ready-for-dev

> Canonical ID: P1-E03-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S01.md

## Story

As an auditor,
I want guarantees that no `wallet_ledger` row was ever modified or deleted,
so that the financial record is provably immutable and trustworthy.

## Acceptance Criteria

1. Migration creates `wallet_ledger` with columns: `id`, `wallet_id`, `amount` (signed, integer cents), `direction` (`credit`|`debit`), `kind` (`topup`|`debit`|`refund`|`adjustment`|`reversal`), `idempotency_key UNIQUE`, `posted_by`, `source`, `reverses_entry_id NULLABLE FK`, `created_at`.
2. Postgres app-role has `REVOKE UPDATE, DELETE` on the table; only migrations run as the owner.
3. Unit test attempts `UPDATE wallet_ledger SET amount=0`; must fail with privilege error.
4. Currency is **integer cents** (KES * 100) throughout the ledger to avoid float drift.

## Tasks / Subtasks

- [ ] Task 1: Define `wallet_ledger` Drizzle schema + migration (AC: #1, #4)
  - [ ] Add `walletLedger` table to `packages/db/src/schema/` with all columns from AC1; `amount` as signed `integer` (cents), `direction`/`kind` as enum/check-constrained text, `idempotency_key` with UNIQUE constraint, `reverses_entry_id` nullable self-FK to `wallet_ledger.id`, `created_at` default now().
  - [ ] Generate migration `packages/db/migrations/0003_wallet_ledger.sql`; keep it additive-only.
- [ ] Task 2: Enforce append-only at the DB level (AC: #2)
  - [ ] In the migration, `REVOKE UPDATE, DELETE ON wallet_ledger FROM bm_app;` (app connections use the `bm_app` role); leave INSERT/SELECT granted. Migrations run as the table owner only.
- [ ] Task 3: Tests (AC: #3, all)
  - [ ] Integration test (vitest) connecting as `bm_app`: `UPDATE wallet_ledger SET amount=0` and `DELETE FROM wallet_ledger` both reject with a privilege error.
  - [ ] Test that INSERT succeeds and a duplicate `idempotency_key` insert violates the UNIQUE constraint.
  - [ ] Assert all amounts are stored/read as integer cents (no float columns).

## Dev Notes

- Append-only ledger is the spine of the wallet system — schema must make mutation impossible at the database privilege layer, not just in application code.
- Currency is integer cents (KES * 100) everywhere; never use float/numeric-with-scale that could drift.
- App connections authenticate as the `bm_app` Postgres role; migrations execute as the owner. `REVOKE UPDATE, DELETE` on the app role is the enforcement mechanism.
- Testing standards: vitest, test-first (red/green/refactor). AC3 is a DB-privilege integration test — needs a live Postgres (see `infra/` docker-compose) connecting as `bm_app`.

### Project Structure Notes
- Schema + migration live in `packages/db` (`packages/db/src/schema/`, `packages/db/migrations/0003_wallet_ledger.sql`).
- Foundational story — no upstream P1 dependencies. Stories P1-E03-S02..S08 build on this table.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S01.md]
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
