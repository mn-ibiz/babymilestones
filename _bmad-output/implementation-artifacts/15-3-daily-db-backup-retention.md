# Story 15.3: Daily DB backup + retention

Status: done

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

- [x] Task 1: Daily backup job + off-host storage (AC: #1)
  - [x] Added `db-backup` job (`apps/jobs/src/jobs/db-backup.ts`) with a daily cadence (`intervalMs = 24h`) and an INJECTED `dump` (pg_dump → off-host upload) so tests never shell out or touch cloud. Registered via `registerDbBackupJob` in `apps/jobs/src/index.ts`. Off-host config + dump wiring sketch documented in `infra/backup-restore-runbook.md`.
- [x] Task 2: 30-day retention (AC: #2)
  - [x] `prune` deletes off-host snapshots whose `started_at` is >30 days old (Decision 35, clock-injectable), stamps `pruned_at`, and skips already-pruned/failed runs.
- [x] Task 3: `backup_runs` audit table (AC: #3)
  - [x] Added `backup_runs` table (`packages/db/migrations/0041_backup_runs.sql` + `packages/db/src/schema/backup-runs.ts`): status, started_at, finished_at, location, size_bytes, error, pruned_at. Additive-only. The job writes a `running` row then stamps success/failed per run.
- [x] Task 4: Restore drill documentation (AC: #4)
  - [x] Documented the manual restore procedure in `infra/backup-restore-runbook.md` to be rehearsed at commissioning.
- [x] Task 5: Tests (AC: all)
  - [x] vitest (`apps/jobs/src/jobs/db-backup.test.ts`, test-first): records success run with injected dump result; records failed run on dump throw; prunes >30-day snapshots while keeping newer ones (clock-injected); does not re-prune pruned/failed runs.

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

claude-opus-4-7

### Debug Log References

- `pnpm --filter @bm/jobs exec vitest run src/jobs/db-backup.test.ts` — 5 passed.
- Full gate green: `pnpm test` (16 tasks, 406 api tests etc. all pass) && `pnpm typecheck` && `pnpm lint` && `pnpm build`.

### Completion Notes List

- Backup dump/upload is an injected `BackupDump` dependency and the off-host store is an injected `BackupStore` — no real pg_dump, no shell exec, no cloud in tests (mocks/fakes only).
- Each run records a `backup_runs` row (`running` → `success`/`failed`) plus an `audit_outbox` entry; dump failures are recorded, not thrown, so the daily cron survives.
- Retention is a fixed 30 days (Decision 35), clock-injectable; prune is idempotent (skips already-pruned and failed/no-location runs).
- Migration `0041_backup_runs.sql` is additive-only and applies cleanly under the PGlite test harness.
- Restore drill is a documented manual procedure (AC4), not automated, per the story.
- Single self-review performed: all 4 ACs covered, no blocker/high findings, no deferrals.

### File List

- packages/db/migrations/0041_backup_runs.sql (new)
- packages/db/src/schema/backup-runs.ts (new)
- packages/db/src/schema/index.ts (modified — export backup-runs)
- apps/jobs/src/jobs/db-backup.ts (new)
- apps/jobs/src/jobs/db-backup.test.ts (new)
- apps/jobs/src/index.ts (modified — export + registerDbBackupJob)
- infra/backup-restore-runbook.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented daily DB backup job + 30-day retention + backup_runs table + restore runbook; full gate green | claude-opus-4-7 |
