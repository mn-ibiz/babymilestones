# Review findings — X8-S03 (daily DB backup + retention)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `e1c5e460`.
**Fixed a data-loss BLOCKER + a silent-failure HIGH** on this data-safety-critical job. AC1/AC3/AC4
otherwise sound; additive migration; restore runbook present.

## Patched this review
- **[Patch][BLOCKER] Retention could delete the last surviving backup.** `prune()` deleted every
  successful run older than 30 days with no baseline guard — a prolonged dump-failure streak would
  eventually prune the final recoverable snapshot. Now `prune()` always keeps the most-recent
  successful snapshot regardless of age (mirrors the repo's own `backup-retention.ts` Rule 1).
- **[Patch][HIGH] Failed backups never alerted.** The handler swallowed dump errors and resolved, so
  the jobs runner marked the run `success` and never paged the error tracker — a broken pipeline could
  run unnoticed for weeks. Now the handler records the failed `backup_runs` row + audit THEN re-throws
  so `runJob` reports it via `captureException`; `onFailure` defaults to retry-next-tick (daily cron
  continues), and the prune is skipped on a failed-dump day (retention never runs without a fresh good
  backup). + `prunedAt` now stamped at actual prune time. Added a data-loss regression test; 6 green.

## Deferred / tracked
- **[Defer] Restore runbook passes `DATABASE_URL` as a `pg_dump` argv** (visible via `ps`). The job
  code leaks nothing; this is a doc sketch for the future deploy story — use `PGPASSWORD`/`.pgpass`.

## Dismissed
Migration ordering (additive `IF NOT EXISTS`); audit atomicity (standalone system events); prune cutoff
epoch-ms arithmetic (DST-safe).
