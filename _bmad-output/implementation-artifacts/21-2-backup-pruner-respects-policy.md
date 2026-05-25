# Story 21.2: Backup pruner respects policy

Status: backlog

> Canonical ID: P2-E06-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E06-S02.md

## Story

As the system, I want to prune older backups so storage doesn't grow forever.

## Acceptance Criteria

1. Daily job in `apps/jobs/backups/prune.ts` reads the policy and deletes expired backups.
2. Action logged in `backup_runs`.
3. Deletion is a soft action: 7-day grace period before physical delete (configurable).

## Tasks / Subtasks

- [ ] Task 1: Implement Backup pruner respects policy (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Daily job in `apps/jobs/backups/prune.ts` reads the policy and deletes expired backups.
  - [ ] Satisfy AC#2: Action logged in `backup_runs`.
  - [ ] Satisfy AC#3: Deletion is a soft action: 7-day grace period before physical delete (configurable).
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
