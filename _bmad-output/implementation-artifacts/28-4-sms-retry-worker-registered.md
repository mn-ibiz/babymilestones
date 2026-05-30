# Story 28.4: SMS retry worker registered

Status: done

> Canonical ID: P3-E06-S04 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S04.md

## Story

Failed SMS sends from `sms_outbox` are retried automatically.

## Acceptance Criteria

1. Job picks `sms_outbox` rows where status=`failed` and attempt_count < 5.
2. Exponential backoff (1m, 5m, 30m, 2h, 12h).
3. After 5 failed attempts → dead-lettered + alert.

## Tasks / Subtasks

- [x] Task 1: Implement SMS retry worker registered (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Job picks `sms_outbox` rows where status=`failed` and attempt_count < 5.
  - [x] Satisfy AC#2: Exponential backoff (1m, 5m, 30m, 2h, 12h).
  - [x] Satisfy AC#3: After 5 failed attempts → dead-lettered + alert.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-E09
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C apps/jobs exec vitest run src/jobs/sms-retry.test.ts` — 7 tests pass.
- `pnpm -C packages/db exec vitest run` — 43 tests pass (sms_outbox schema change).

### Completion Notes List

- AC1 — `apps/jobs/src/jobs/sms-retry.ts` `createSmsRetryJob` selects `sms_outbox`
  rows with status=`failed`, `attempt_count < 5`, not dead-lettered, past the
  `next_attempt_at` backoff gate (oldest-first, bounded batch). Migration
  `0077_sms_outbox_retry.sql` adds `attempt_count`, `next_attempt_at`,
  `dead_lettered_at`, `last_error`, `sent_at` (+ a scan index); the drizzle
  `sms.ts` schema mirrors them.
- AC2 — a failed (re)send bumps `attempt_count` and sets `next_attempt_at` via the
  exponential ladder 1m / 5m / 30m / 2h / 12h (`backoffMs`, unit-tested).
- AC3 — the 5th failed attempt dead-letters the row (status `dead_lettered`,
  `dead_lettered_at` stamped), writes a `sms.retry.dead_lettered` audit row, and
  logs an error-level alert. Per-row isolation keeps a bad row from aborting the
  batch.
- Registered via `registerSmsRetryJob` in `apps/jobs/src/index.ts`; the job
  declares a 60s interval/cron + retry-next-tick policy → registry + run-now
  console. The `sms.retry.dead_lettered` audit action lives in the `@bm/auth`
  catalogue (the `jobs` category, added with 28-1).
- The provider (re)send is injected (`SmsResend`) so the worker is provider-
  agnostic + testable; production wires the real `@bm/sms` sender at boot.

### File List

- packages/db/migrations/0077_sms_outbox_retry.sql (new)
- packages/db/src/schema/sms.ts (retry columns)
- apps/jobs/src/jobs/sms-retry.ts (new) + sms-retry.test.ts (new)
- apps/jobs/src/index.ts (export + registerSmsRetryJob)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | SMS retry worker: backoff retry of failed sms_outbox rows + dead-letter/alert at 5 attempts | claude-opus-4-8 |
| 2026-05-30 | 1.1 | Renumbered migration 0058b→0077 (POS 0058 collision); sprint status marked done | claude-opus-4-8 |
