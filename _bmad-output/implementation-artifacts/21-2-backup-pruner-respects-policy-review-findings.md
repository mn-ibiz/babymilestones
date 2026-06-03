# Review findings — P2-E06-S02 (backup pruner respects policy)

Sweep review 2026-06-03. Commit `992c2946` (epic). **Data-safety core PASS:** Rule 1 unconditionally
protects the most-recent successful backup regardless of keep counts (`selectBackupsToPrune` —
the Epic 15 X8-S03 bug is NOT present here); degenerate policy can't delete everything (`dailyKeep>=1`
+ defaults fallback); cutoff uses `>=` epoch-ms + UTC month keys (no off-by-one/DST); idempotent
(skips `prunedAt != null`). AC1/AC2 tested. No code change (findings are decisions/defer).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Two pruners with different policies coexist** — the legacy `db-backup.ts` prune
  (X8-S03) uses a hardcoded 30-day window and ignores the configurable policy; if both are ever wired
  to the scheduler, the legacy one could delete monthly-tier backups the new policy intends to keep.
  Decide which pruner is canonical and retire the other's prune.
- **[Decision][MED] AC3 "soft deletion with grace before physical delete"** is implemented as
  creation-age protection, not a two-phase soft delete that delays physical removal. Confirm intent.

## Deferred / tracked
- **[Defer] Partial-failure ordering** — `store.remove()` precedes the `prunedAt` stamp (no tx). Current
  order is self-healing if `remove` is idempotent on a missing object; "stamp-first" would instead
  leak orphan objects on failure, so the current order is defensible. Tracked, not changed.

## Dismissed
Rule 1 (protected); degenerate policy (guarded); cutoff/TZ; idempotency — all verified PASS.
