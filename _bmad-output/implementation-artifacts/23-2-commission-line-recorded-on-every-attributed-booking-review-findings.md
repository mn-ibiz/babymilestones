# Review findings — P3-E01-S02 (commission line on every attributed booking)

Sweep review 2026-06-03. Commit `45fe5dae` (epic). Append-only + idempotent (partial unique index +
onConflictDoNothing); integer bps math; rate snapshot at booking time. No code change (the two
findings are money-correctness decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][BLOCKER · finance] Subscription-covered bookings accrue ZERO commission** —
  `recordBookingCommission` uses `booking.staffRateSnapshot`, but the subscription path sets it to 0
  (no wallet charge), so every subscription visit writes a `commission_ledger` row with `amountCents=0`.
  Same root as Epic 17 #32. Decide the per-session value + whether stylists earn on subscription visits.
- **[Decision][HIGH] AC2 commission reversal not wired** — `reverseBookingCommission` has no production
  caller; the admin refund route never reverses commission → a refunded booking leaves the stylist's
  accrual on the ledger (money leak). Wire it into refund, but DEFINE partial-refund behavior first
  (the function reverses the FULL accrual → would over-reverse a partial refund).

## Dismissed
`source` CHECK widened by 0090 (reassign, story 25); rateSnapshot numeric-as-string (tested); negative base guarded.
