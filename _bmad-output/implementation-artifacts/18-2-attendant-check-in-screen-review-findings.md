# Review findings — P2-E03-S02 (attendant check-in screen)

Sweep review 2026-06-03. Commit `6b3fad30` (epic-level). Wallet debit correctly invoked (stable
idempotency key, debit-first, replay/DoubleCheckIn handled); double-check-in fenced by
`UNIQUE(booking_id)` → 409. AC1–AC4 tested. **Fixed a BLOCKER IDOR.**

## Patched this review
- **[Patch][BLOCKER] Missing `isStaffRole` gate → a parent could check in / debit any family's
  booking** (+ enumerate other children's cards). The route gated only on `read wallet` / `create
  payment`, both held by the `parent` role, and `checkInBooking` takes an arbitrary `bookingId` with
  no caller scoping. Added the `isStaffRole` gate to `authStaff` (`attendance.ts`). api(48) green.

## Dismissed
Separate-tx debit/insert (documented retry-safe); bulk capped; `paidVia` two-value handling.
