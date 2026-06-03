# Review findings — P2-E01-S06 (parent or reception cancels a booking)

Sweep review 2026-06-03. Commit `931d0891`. Seat-freeing correct & idempotent (capacity excludes
cancelled everywhere; voided-invoice leak fix `NOT IN ('settled','void')` applied consistently); IDOR
handled; audit atomic. **Fixed a HIGH money bug.**

## Patched this review
- **[Patch][HIGH · money] `cancelBooking` didn't lock the booking row → concurrent cancels
  double-charged the cancellation fee.** The double-cancel guard read an unlocked snapshot; two
  concurrent reception cancels both passed it and both inserted a pending fee invoice (real double
  charge), wrote duplicate audit rows, and double-refunded the subscription unit. Added `.for("update")`
  on the booking select (mirrors bookSlot/rescheduleBooking) so the loser blocks, re-reads `cancelled`,
  and throws before any second write. catalog schedules(41) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Parent self-cancel reuses `rescheduleCutoffHours`** — no dedicated
  `cancellation_cutoff_hours`; changing the reschedule window silently moves the cancel deadline.

## Deferred / tracked
- **[Defer] Reception cancel raises a fee even on an already-paid booking, with no auto-refund**
  (documented intentional; refund is the P1-E03-S06 path; `voidedInvoiceId=null` signals it).
- **[Defer] Parent cancel returns 404 if the slot was reconciled away** (shared with reschedule).

## Dismissed
Invoice void idempotency (`WHERE status='pending'`); FIFO only touches pending; IDOR; atomic audit.
