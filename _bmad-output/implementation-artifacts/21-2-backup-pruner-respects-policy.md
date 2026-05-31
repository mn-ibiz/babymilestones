# Story 21.2: Backup pruner respects policy

Status: done

> Canonical ID: P2-E06-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S02.md

## Story

As the system, I want to prune older backups so storage doesn't grow forever.

## Acceptance Criteria

1. Daily job in `apps/jobs/backups/prune.ts` reads the policy and deletes expired backups.
2. Action logged in `backup_runs`.
3. Deletion is a soft action: 7-day grace period before physical delete (configurable).

## Tasks / Subtasks

- [x] Task 1: Implement Backup pruner respects policy (AC: #1, #2, #3)
  - [x] Satisfy AC#1: Daily cron `backup-prune` (in `apps/jobs/src/jobs/backup-prune.ts`, per repo convention) reads the effective policy (21-1) and prunes out-of-policy backups.
  - [x] Satisfy AC#2: Each prune stamps `backup_runs.prunedAt` and writes a `backup.run.pruned` audit row.
  - [x] Satisfy AC#3: Configurable grace window (`graceDays`, default 7) — nothing inside it is ever pruned; and the most-recent successful backup is ALWAYS retained.
- [x] Task 2: Tests (AC: all)
  - [x] Test-first with vitest: pure selection logic unit tests (boundaries, never-delete-newest, grace, daily/monthly tiers) + job integration on real PGlite (policy read, default/malformed fallback, audit, idempotency).

## Dev Notes

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): - S01 - P1-X8. ---
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E06.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

Jobs gate all green: 16 test files / 92 tests, tsc clean.

### Completion Notes List

- AC#1 path adjusted to the real repo convention: the job lives at `apps/jobs/src/jobs/backup-prune.ts` and registers on the jobs runner as `backup-prune` (createXJob(deps): Job + register wrapper), not the literal `apps/jobs/backups/prune.ts` from the planning AC.
- AC#2: the existing `backup_runs.prunedAt` column records the soft action; additionally a durable `backup.run.pruned` audit row is written per deletion. No new column / migration — 0082 stays reserved/unused.
- Retention DECISION is isolated in a pure `selectBackupsToPrune(runs, policy, now)` so the boundary rules are unit-tested with no I/O. Guarantees: (1) the single most-recent successful backup is never pruned even under an aggressive policy; (2) nothing inside the grace window is pruned; (3) daily tier keeps the N newest, monthly tier keeps the latest backup of each of the most-recent `monthlyKeep` months; (4) failed / already-pruned / location-less runs are skipped → re-running is idempotent.
- Policy is read via the same effective-policy resolution as 21-1 (stored-or-defaults), so a missing or malformed policy never stops the pruner.

### File List

- apps/jobs/src/jobs/backup-retention.ts (new — pure `selectBackupsToPrune`)
- apps/jobs/src/jobs/backup-retention.test.ts (new — unit)
- apps/jobs/src/jobs/backup-prune.ts (new — daily cron, I/O shell)
- apps/jobs/src/jobs/backup-prune.test.ts (new — PGlite integration)
- apps/jobs/src/index.ts (export + `registerBackupPruneJob`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-30 | 1.0 | Implemented policy-driven `backup-prune` daily cron: pure retention selector + PGlite-tested job, registered on the runner. Reused `backup_runs.prunedAt` + `settings`; no migration. | Dev |
