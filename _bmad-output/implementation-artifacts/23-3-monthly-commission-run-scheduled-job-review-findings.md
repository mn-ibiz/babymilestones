# Review findings — P3-E01-S03 (monthly commission run — scheduled job)

Sweep review 2026-06-03. Commit `45fe5dae` (epic). Monthly idempotency via partial unique index on
`(period_start,period_end) WHERE kind='monthly'` + claim-by-run_id (re-run is a no-op; tested).
AC2–AC5 met. **The double-pay race shared with S04 is fixed (see S04 findings — claim-first).**

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · cross-cutting] AC1 cron not honored** — the scheduler fires on a 30-day
  `setInterval`, not the declared `0 2 1 * *` (no cron parser exists in `apps/jobs`). Months drift; a
  close can land late / in the wrong period. This is the jobs-framework cron-vs-interval gap (also hits
  db-backup, anonymise, mpesa-reconcile) — resolve in the Epic 28 jobs-runner review.
- **[Decision][MED] Period boundary is UTC midnight, not EAT** — near-month-boundary bookings attributed
  to the UTC month (internally consistent with the staff-earnings view). Cross-cutting timezone decision.
- **[Decision][low] Concurrent-race recovery queries an already-aborted tx** (the monthly-conflict
  catch's SELECT runs on the aborted tx) — masked by the job's 3-attempt retry; harden with
  onConflictDoNothing+re-select or a savepoint.

## Dismissed
commission.run.failed in catalogue (audit doesn't enforce); reassign CHECK (0090); spec path cosmetic.
