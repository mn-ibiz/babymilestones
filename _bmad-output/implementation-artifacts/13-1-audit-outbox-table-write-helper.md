# Story 13.1: audit_outbox table + write helper

Status: review

> Canonical ID: X5-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X5-S01.md

## Story

As a developer,
I want to record an audit event in the same transaction as the business write without slowing it down,
so that every audited action has a durable record without coupling latency to a logging system.

## Acceptance Criteria

1. `audit_outbox` table: id, actor_user_id, action, target_table, target_id, payload JSONB, created_at, processed_at NULLABLE.
2. Helper `audit({ actor, action, target, payload })` insertable in any TX.
3. Outbox row is the durable audit guarantee.

## Tasks / Subtasks

- [x] Task 1: Add `audit_outbox` table to the shared Drizzle schema (AC: #1, #3)
  - [x] `packages/db/src/schema/audit.ts` defines `auditOutbox`: `id` (uuid PK, `gen_random_uuid()`), `actor_user_id` (uuid, nullable), `action` (text NOT NULL), `target_table`, `target_id`, `payload` (jsonb NOT NULL default `{}`), `created_at` (timestamptz default now), `processed_at` (timestamptz nullable). Re-exported from `packages/db/src/index.ts` via `schema/index.ts` barrel.
  - [x] Additive-only migration `packages/db/migrations/0001_audit_outbox.sql` (+ partial index on unprocessed rows for the X5-S02 drain).
- [x] Task 2: Implement the `audit()` write helper (AC: #2, #3)
  - [x] `audit(executor, { actor, action, target, payload })` in `packages/db/src/audit.ts` inserts one row using the caller's executor — passing a `tx` makes it join the surrounding business transaction. Returns the inserted row.
  - [x] `target` → `target_table` + `target_id`; `payload` → JSONB; `processed_at` left NULL on insert.
- [x] Task 3: Tests (AC: all)
  - [x] `packages/db/src/audit.test.ts` (test-first, RED→GREEN): inserts row with all fields + `processed_at` NULL; **rolls back atomically** when the enclosing TX throws (durable-guarantee proof); commits with the TX. Runs against PGlite (in-memory real Postgres) via the new `@bm/db/testing` harness.

## Dev Notes

- Outbox pattern: the audit row is written in the SAME transaction as the business write, making the outbox row the durable audit guarantee (no separate logging call that can fail independently). The async projection is handled in X5-S02.
- Anchor to `packages/db` (single shared Drizzle schema; domain tables unprefixed). Import name `@bm/db`.
- Migrations must be additive-only.
- Testing standards: vitest, test-first, TS strict. Cover the AC via the DoD requirement that all AC have a passing test.

### Project Structure Notes
- New table + migration live in `packages/db`. Helper exported from `packages/db/src/index.ts`.
- Dependencies: none (per source). X5-S02 (drain worker) and X5-S03 (audit catalogue) depend on this story.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X5-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X5]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- RED: `pnpm --filter @bm/db test` failed (no schema/helper/harness).
- GREEN after implementation; full gate green: test/typecheck/lint (14/14), build (5/5).
- Established the project's DB test harness: PGlite (in-memory real Postgres) + `drizzle-orm/pglite`, applying migration `.sql` files. Exported as `@bm/db/testing` for reuse by wallet/auth/etc.

### Completion Notes List

- ✅ AC1: `audit_outbox` has every specified column with correct types/nullability.
- ✅ AC2: `audit()` is executor-agnostic — usable standalone or inside any caller TX.
- ✅ AC3: rollback test proves the outbox row lives/dies with the business transaction (the durable audit guarantee).
- The `audit()` executor type is currently PGlite-typed; generalise to the prod postgres-js client when that DB wiring lands (noted inline).

### File List

- `packages/db/src/schema/audit.ts` (new) — `auditOutbox` table
- `packages/db/src/schema/index.ts` (new) — schema barrel
- `packages/db/migrations/0001_audit_outbox.sql` (new) — additive migration
- `packages/db/src/audit.ts` (new) — `audit()` helper
- `packages/db/src/testing.ts` (new) — PGlite test harness (`createTestDb`)
- `packages/db/src/audit.test.ts` (new) — AC tests
- `packages/db/src/index.ts` (modified) — export schema + `audit`
- `packages/db/package.json` (modified) — `@electric-sql/pglite` dep + `./testing` export

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented test-first; PGlite harness established; all ACs satisfied; status → review | bmad-dev-story |
