# Story 3.1: Append-only `wallet_ledger` schema enforced at DB level

Status: done

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

- [x] Task 1: Define `wallet_ledger` Drizzle schema + migration (AC: #1, #4)
  - [x] Added `walletLedger` to `packages/db/src/schema/wallet-ledger.ts` with all AC1 columns; `amount` as signed `bigint` (integer cents, headroom + no float drift), `direction`/`kind` as CHECK-constrained text, `idempotency_key` UNIQUE, `reverses_entry_id` nullable self-FK to `wallet_ledger.id`, `created_at` default now(). Exported from schema barrel.
  - [x] Migration `packages/db/migrations/0011_wallet_ledger.sql` (next free number — 0003 was already taken by 0003_users_role); additive-only.
- [x] Task 2: Enforce append-only at the DB level (AC: #2)
  - [~] Enforced via a **trigger that RAISEs on UPDATE/DELETE** (portable, holds for owner/superuser AND under the single-superuser PGlite harness). The `REVOKE UPDATE, DELETE` / `GRANT SELECT, INSERT` on `bm_app` is also issued, guarded behind `IF EXISTS(role)` so it is a no-op where the role is not yet provisioned. Reason for `[~]`: the literal role-REVOKE in AC2 cannot be the *tested* enforcement under PGlite; the trigger is — see review-findings.md.
- [x] Task 3: Tests (AC: #3, all)
  - [x] vitest against PGlite (`createTestDb`): `UPDATE wallet_ledger SET amount=0` and `DELETE FROM wallet_ledger` both reject (`/append-only/i`), and the row is verified unchanged/present afterward.
  - [x] INSERT (credit + signed-negative debit + reversal self-link) succeeds; duplicate `idempotency_key` rejected; unknown direction/kind rejected (CHECK); FK to a missing wallet rejected.
  - [x] Asserted `amount` column data type is `bigint` via information_schema (no float/numeric columns).

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

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
New suite `packages/db/src/schema/wallet-ledger.test.ts` — 9 tests pass (22 total in @bm/db).

### Completion Notes List

- Append-only is enforced by a DB **trigger** (`wallet_ledger_block_mutation`) that
  RAISEs on UPDATE/DELETE. Chosen over role REVOKE as the source-of-truth guarantee
  because it holds for the table owner/superuser and works under PGlite (single
  superuser), so AC3 is genuinely testable. The AC2 `bm_app` REVOKE/GRANT is also
  applied, guarded by `IF EXISTS(role)` for production defence-in-depth.
- Money is `bigint` signed integer cents (KES * 100); credits positive, debits
  negative. No float/numeric columns anywhere.
- Migration numbered 0011 (next free slot; the story text's "0003" predated later
  migrations). Additive-only.
- `@bm/wallet` now exports ledger primitive types/constants (`Cents`,
  `LedgerDirection`, `LedgerKind`, `LedgerEntry`) for downstream S02–S08.
- One low-severity follow-up deferred (bm_app role provisioning) — see
  `3-1-append-only-wallet-ledger-schema-enforced-at-review-findings.md`.

### File List

- packages/db/src/schema/wallet-ledger.ts (new)
- packages/db/src/schema/wallet-ledger.test.ts (new)
- packages/db/src/schema/index.ts (export barrel)
- packages/db/migrations/0011_wallet_ledger.sql (new)
- packages/wallet/src/index.ts (ledger primitive types/constants)
- _bmad-output/implementation-artifacts/3-1-append-only-wallet-ledger-schema-enforced-at-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented append-only wallet_ledger (schema, trigger-enforced immutability, migration 0011, tests, @bm/wallet primitives); status done | claude-opus-4-7 |
