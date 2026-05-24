# Story 13.1: audit_outbox table + write helper

Status: ready-for-dev

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

- [ ] Task 1: Add `audit_outbox` table to the shared Drizzle schema (AC: #1, #3)
  - [ ] Define table in `packages/db/src/` (e.g. `schema/audit.ts`, re-exported from `packages/db/src/index.ts`): `id` (uuid/serial PK), `actor_user_id`, `action`, `target_table`, `target_id`, `payload` (jsonb), `created_at` (default now), `processed_at` (nullable timestamp).
  - [ ] Generate an additive-only Drizzle migration under `packages/db` migrations.
- [ ] Task 2: Implement the `audit()` write helper (AC: #2, #3)
  - [ ] Export `audit({ actor, action, target, payload })` from `packages/db` so it inserts a single `audit_outbox` row using the caller's transaction handle (accepts a `tx`/db executor so it participates in the surrounding business TX).
  - [ ] `target` resolves to `target_table` + `target_id`; `payload` serialised to JSONB; `processed_at` left NULL on insert.
- [ ] Task 3: Tests (AC: all)
  - [ ] vitest unit/integration: helper inserts a row with all fields; row is committed/rolled back atomically with the enclosing TX; `processed_at` is NULL on write. Test-first (red/green/refactor).

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
