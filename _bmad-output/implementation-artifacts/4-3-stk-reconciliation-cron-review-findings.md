# Review findings — P1-E04-S03 (M-Pesa STK reconciliation cron)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `efd7a0f4` (verified
against the working tree, which diverged via P3-E06-S05). Core idempotency is **sound** — both the
S02 callback and this cron credit via `applyTopup` keyed on `mpesa_callback.id`, with
`wallet_ledger.idempotency_key UNIQUE` the hard guard; money taken from our own request row, never
Daraja. AC1–AC5 tested.

## Patched this review

- **[Patch][MED] Cron overwrote a terminal state set by a concurrent callback (false-failure SMS).**
  `apps/jobs/src/jobs/mpesa-reconcile.ts` — `reconcileSuccess`/`reconcileFailure`/`expire` updated by
  `id` only, with no `state IN (pending)` predicate. A callback that already credited + marked a row
  `SUCCEEDED` could be overwritten to `FAILED` by the cron, firing a parent SMS "top-up could not be
  completed" for money that WAS credited. Fixed: all three transitions now guard
  `state IN (PENDING_STATES)` via `.returning()`, and the SMS/audit only fire when the transition
  actually happened. 9 reconcile tests green.

## Deferred / tracked
- **[Defer] No index backing the 60s candidate scan** — seq-scans the whole `mpesa_stk_request`
  table each tick (rows never pruned). Add a partial index when volume warrants.
- **[Defer] No per-row error isolation in the batch loop** — a poison row aborts the run (matches
  sibling-job convention). Wrap per-row body in try/catch if hardened later.

## Dismissed
Spec-literal `CALLBACK_PENDING` never written (cron correctly also scans `STK_SENT`); timeout→leave
for next run; money from our amount; >15min EXPIRED path.
