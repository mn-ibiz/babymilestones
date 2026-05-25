# Story 28.1: Job framework: scheduling + observability

Status: backlog

> Canonical ID: P3-E06-S01 · Phase: P3 · Source: _bmad-output/planning-artifacts/stories/p3/P3-E06-S01.md

## Story

As ops, I want a single place jobs are defined, scheduled, and monitored.

## Acceptance Criteria

1. `apps/jobs` exposes a registry: name, schedule (cron expression), handler, on-failure policy.
2. Each run logged: `job_runs` table with started_at, ended_at, status, error.
3. Failed runs alert via Sentry.
4. Manual "run now" available to super-admin from admin console.

## Tasks / Subtasks

- [ ] Task 1: Implement Job framework: scheduling + observability (AC: #1, #2, #3, #4)
  - [ ] Satisfy AC#1: `apps/jobs` exposes a registry: name, schedule (cron expression), handler, on-failure policy.
  - [ ] Satisfy AC#2: Each run logged: `job_runs` table with started_at, ended_at, status, error.
  - [ ] Satisfy AC#3: Failed runs alert via Sentry.
  - [ ] Satisfy AC#4: Manual "run now" available to super-admin from admin console.
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
