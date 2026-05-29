# Story 28.1: Job framework: scheduling + observability

Status: in-progress

> Canonical ID: P3-E06-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S01.md

## Story

As ops, I want a single place jobs are defined, scheduled, and monitored.

## Acceptance Criteria

1. `apps/jobs` exposes a registry: name, schedule (cron expression), handler, on-failure policy.
2. Each run logged: `job_runs` table with started_at, ended_at, status, error.
3. Failed runs alert via Sentry.
4. Manual "run now" available to super-admin from admin console.

## Tasks / Subtasks

- [x] Task 1: Implement Job framework: scheduling + observability (AC: #1, #2, #3, #4)
  - [x] Satisfy AC#1: `apps/jobs` exposes a registry: name, schedule (cron expression), handler, on-failure policy.
  - [x] Satisfy AC#2: Each run logged: `job_runs` table with started_at, ended_at, status, error.
  - [x] Satisfy AC#3: Failed runs alert via Sentry.
  - [x] Satisfy AC#4: Manual "run now" available to super-admin from admin console.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

`node-cron` or BullMQ. Single-worker model in P3; scale-out later.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): P1-X8.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P3-E06.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `pnpm -C apps/jobs exec vitest run src/runner.test.ts` — 9 tests pass.
- `pnpm -C apps/api exec vitest run src/routes/admin/jobs.test.ts` — 6 tests pass.
- `pnpm -C apps/admin exec vitest run` includes the jobs page test (3 cases) — pass.
- tsc --noEmit clean for packages/db, apps/jobs, apps/api, apps/admin.

### Completion Notes List

- AC1 — `apps/jobs/src/registry.ts` `Job` now carries name, `cron` expression,
  `intervalMs`, `onFailure` policy, and the handler; `schedule()` returns public
  descriptors and `allJobs()` the live jobs. Existing crons declare cron + policy.
- AC2 — new `job_runs` table (migration `0058_job_runs.sql` + drizzle schema
  `job-runs.ts`). `runJob()` (apps/jobs/src/runner.ts) opens a `running` row
  (started_at), then stamps ended_at + status (`success`|`failed`) + error.
- AC3 — `runJob` forwards a thrown handler to an injected `JobTracker`
  (`captureException`, the `@bm/observability` ErrorTracker shape → Sentry in
  prod) and logs an error line. Handler errors are isolated (never rethrown);
  `startScheduler` adds a per-job overlap guard.
- AC4 — `apps/api/src/routes/admin/jobs.ts`: GET `/admin/jobs`, GET
  `/admin/jobs/:name/runs`, POST `/admin/jobs/:name/run`, reserved to super-admin
  via `can(role,"manage","role")`. Run-now records a `manual` `job_runs` row
  (acting user) + a `job.run_now` audit entry; failures are isolated. Admin page
  `app/(console)/jobs/page.tsx` lists jobs + a Run-now button; nav link added.
- New audit action `job.run_now` (and `sms.retry.dead_lettered` for 28-4)
  registered in the `@bm/auth` catalogue.
- Migration note: HEAD of this worktree predates the POS session's 0055–0058
  (those are not in this branch), but the reserved number 0058 is honoured here;
  on merge there will be parallel 0058_* files (pos_cashups vs job_runs) — both
  additive, neither colliding on table/object names.

### File List

- packages/db/migrations/0058_job_runs.sql (new)
- packages/db/src/schema/job-runs.ts (new) + schema/index.ts (re-export)
- apps/jobs/src/runner.ts + runner.test.ts (new)
- apps/jobs/src/registry.ts (cron/onFailure/schedule/allJobs) + index.ts (exports)
- apps/api/src/routes/admin/jobs.ts + jobs.test.ts (new) + admin/index.ts + app.ts (wire jobs)
- apps/admin/app/(console)/jobs/page.tsx + page.test.tsx (new) + lib/nav.ts
- packages/auth/src/audit-actions.ts (jobs category)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Job framework: registry + job_runs + runner/scheduler + Sentry alert + super-admin run-now (API + console) | claude-opus-4-8 |
