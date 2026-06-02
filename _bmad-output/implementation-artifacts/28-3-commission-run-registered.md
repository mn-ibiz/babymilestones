# Story 28.3: Commission run registered

Status: done

> Canonical ID: P3-E06-S03 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S03.md

## Story

Monthly commission run (P3-E01-S03) runs via the framework.

## Acceptance Criteria

1. Registered as `commission.monthly` with cron `0 2 1 * *`.
2. Failures retried; max 3 attempts before alert.

## Tasks / Subtasks

- [x] Task 1: Implement Commission run registered (AC: #1, #2)
  - [x] Satisfy AC#1: Registered as `commission.monthly` with cron `0 2 1 * *`.
  - [x] Satisfy AC#2: Failures retried; max 3 attempts before alert.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P3-E01-S03
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- `cd apps/jobs && pnpm vitest run` → 19 files, 112 tests passed.
- `cd packages/auth && pnpm vitest run` → 10 files, 82 tests passed (audit-actions completeness now covers `commission.run.failed`).
- `pnpm typecheck` (root) → 17/17 packages successful.

### Completion Notes List

- AC1: The monthly commission run is now registered in the jobs framework as `commission.monthly` (renamed from the placeholder `commission-run`) with cron `0 2 1 * *` (02:00 on the 1st). `intervalMs` (monthly) keeps the single-worker `startScheduler` firing it; `cron` is the canonical declaration surfaced by `registry.schedule()` + admin observability. Already wired via `registerCommissionRunJob` in `apps/jobs/src/index.ts` (unchanged).
- AC2: Added a framework-level `maxAttempts` field to the `Job` type + `JobDescriptor` (defaults to 1, surfaced by `schedule()`). The commission job declares `maxAttempts: 3` and its handler runs an in-run retry loop (safe because `createCommissionRun` is idempotent per month). On exhausting all 3 attempts it RAISES AN ALERT — audits the new `commission.run.failed` action and logs an error line — then RETHROWS so the framework's `runJob` records the failed `job_runs` row and forwards it to the Sentry-style error tracker. `onFailure: "alert-only"` (a once-a-month one-shot, not a poll loop). Mirrors the dead-letter "audit IS the alert" pattern of the 28-4 (sms-retry) / 28-5 (mpesa-reconcile) / etims-retry siblings.
- Reused the existing P3-E01-S03 commission run business logic (`createCommissionRun` / `priorMonthPeriod` from `@bm/catalog`) — no reimplementation.
- Registered the new `commission.run.failed` audit action in `packages/auth/src/audit-actions.ts` (commission category) so the audit-actions completeness test stays green.

### File List

- apps/jobs/src/jobs/commission-run.ts (modified)
- apps/jobs/src/jobs/commission-run.test.ts (modified)
- apps/jobs/src/registry.ts (modified)
- apps/jobs/src/registry.test.ts (modified)
- packages/auth/src/audit-actions.ts (modified)
- _bmad-output/implementation-artifacts/28-3-commission-run-registered.md (modified)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-06-02 | 0.2 | Registered monthly commission run as framework job `commission.monthly` (cron `0 2 1 * *`); added framework `maxAttempts` with 3-attempt retry + alert-on-exhaustion (`commission.run.failed`). Status → review. | Amelia (dev-story) |
