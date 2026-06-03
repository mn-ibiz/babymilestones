# Review findings — P3-E06-S03 (commission run registered under the framework)

Sweep review 2026-06-03. Commit `32a0f533`. Descriptor correct (`commission.monthly`, cron `0 2 1 * *`,
`onFailure: alert-only`, `maxAttempts: 3`, tested); idempotency holds under framework re-fires (the
P3-E01-S04 double-pay race is fixed in the working tree — claim-first via RETURNING).

## Patched this review
- **[Patch][MED] AC2 failure alert was swallowed when the DB is the failure cause.** On exhausting all
  attempts the handler did `await audit(db, …)` (unguarded) before the error log + rethrow — but the
  commonest cause of failing every attempt is the DB being down, in which case the audit insert ALSO
  throws, skipping the alert log and propagating a misleading insert error instead of `lastError`.
  Reordered: error log first, audit guarded in its own try/catch, always `throw lastError`. jobs(12) green.

## Decision needed (see DECISIONS-NEEDED.md — consolidated cron)
- **[Decision][HIGH] cron `0 2 1 * *` not honored** — scheduler fires on `intervalMs=30 days` (≠ a
  calendar month). Part of the framework cron decision (S01). (+ LOW: 3 retries are immediate with no
  backoff and `maxAttempts` is observability-only — confirm intended retry semantics.)

## Dismissed
descriptor metadata correct; per-month unique index makes re-fires safe; READ-COMMITTED race already fixed.
