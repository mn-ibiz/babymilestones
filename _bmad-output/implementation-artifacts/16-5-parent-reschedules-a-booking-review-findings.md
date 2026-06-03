# Review findings — P2-E01-S05 (parent reschedules a booking)

Sweep review 2026-06-03. Commit `86e30f17`. Capacity accounting correct (repoint slot_id atomically
frees old / consumes new), new-slot `FOR UPDATE` race-safe, IDOR enforced, cutoff tested. AC1–AC4 met.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · money] Reschedule of a subscription-paid booking can move it outside the
  subscription's covered period without re-validating entitlement** — a unit granted for period N is
  consumed for a slot in period N+1 (period N+1's own entitlement is untouched → double-dip).
  `rescheduleBooking` predates the subscription feature (Epic 17) and was never updated. **Choose:**
  block cross-period reschedule, or re-run the bookSlot entitlement logic on reschedule.

## Deferred / tracked
- **[Defer] New-slot past-check is non-transactional (TOCTOU)** — sub-second, mirrors bookSlot.

## Dismissed
Already-cancelled reschedule guard + duplicate-child cancelled filter (both fixed by the S06 commit in
the working tree); same-slot no-op (409); non-locked ownership read (parentId immutable).
