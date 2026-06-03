# Review findings — P2-E02-S05 (renewal / dunning state machine)

Sweep review 2026-06-03. Commit `4263445b`. Happy path solid, AC1–AC5 tested (charge on period-end,
roll+reset, dunning+SMS+retry, 3-day grace→paused, auto-credit). No code change — failure-mode money
decisions for the user.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · money] Non-atomic renewal can double-charge.** `attemptRenewal` inserts a
  `pending` invoice in one autocommit, then `debit()` in a separate tx. The idempotency key fences only
  the ledger debit, not the invoice. If the process crashes after the invoice commits but before the
  debit posts, a later wallet top-up FIFO-settles the orphaned invoice WHILE the next cron run posts a
  fresh debit → the period is charged twice. Wrap in one tx (tx-accepting debit) or make renewal
  invoices un-FIFO-settleable. `apps/jobs/src/jobs/subscription-renew.ts:56-68`.
- **[Decision][MED] Period-roll update + `subscription.renewed` audit are non-atomic** (audit-trail/DoD
  gap on crash). Wrap each transition's update+audit in a tx.
- **[Decision][MED] A due sub with no resolvable plan price stalls silently forever** — never charged,
  never dunned, no alert, but still honours entitlement (revenue leak). Emit an alert / move to dunning.

## Deferred / tracked
- **[Defer] Renewal cron loads all subs unbounded, no FOR UPDATE** (relies on single-instance; deploy/scale story).

## Dismissed
`status:'void'` valid (0045); debit double-charge fenced by ledger UNIQUE; dunning excluded from booking match; grace/UTC math correct.
