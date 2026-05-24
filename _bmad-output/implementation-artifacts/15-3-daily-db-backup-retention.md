# Story 15.3: Daily DB backup + retention

Status: ready-for-dev

> Canonical ID: X8-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X8-S03.md

## Story

As admin,
I want a backup of yesterday's data, every day, automatic,
so that we can recover from data loss within a known retention window.

## Acceptance Criteria

1. Daily snapshot to off-host storage.
2. Retention fixed at 30 days in P1 (Decision 35).
3. `backup_runs` table records every run + result.
4. Restore drill rehearsed at commissioning (manual procedure documented).

## Tasks / Subtasks

- [ ] Task 1: Daily backup job + off-host storage (AC: #1)
  - [ ] Add a scheduled daily Postgres snapshot (pg_dump/snapshot) pushed to off-host storage; wire the schedule under `infra/` (and/or register a job in `apps/jobs/src/registry.ts` if run by the worker).
- [ ] Task 2: 30-day retention (AC: #2)
  - [ ] Prune snapshots older than 30 days (Decision 35) — fixed retention for P1.
- [ ] Task 3: `backup_runs` audit table (AC: #3)
  - [ ] Add `backup_runs` table to `packages/db` (started_at, finished_at, status/result, size, location/error) via an additive-only migration; the backup job writes a row per run.
- [ ] Task 4: Restore drill documentation (AC: #4)
  - [ ] Document the manual restore procedure (under `infra/`) to be rehearsed at commissioning.
- [ ] Task 5: Tests (AC: all)
  - [ ] vitest: backup job records a `backup_runs` row with success/failure result; retention prune removes >30-day snapshots and keeps newer ones (clock-injectable). Test-first.

## Dev Notes

- Anchor: `infra/` for the backup schedule + off-host storage config + restore runbook (Postgres/Redis defined in `infra/docker-compose.yml`); `backup_runs` table + migration in `packages/db`. If executed by the worker, register via `apps/jobs/src/registry.ts`.
- Retention is a fixed 30 days per Decision 35. Migrations additive-only.
- TS strict, vitest test-first. Restore drill is a documented manual procedure (not automated).

### Project Structure Notes
- Backup schedule/script + restore runbook in `infra/`; `backup_runs` table + migration in `packages/db`; optional job registration in `apps/jobs`.
- Dependencies: none.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X8-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X8]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
