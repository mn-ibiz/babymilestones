# Review findings — P5-E01-S03 (group session booking: capacity > 1, seats remaining)

Sweep review 2026-06-03. Epic commit. **✅ Oversell-safe.** AC1–AC3 implemented & tested. The headline
risk — capacity oversell on concurrent last-seat claims — is HANDLED: `bookCoachingSlot` re-counts
non-cancelled bookings against `slot.capacity` **after** the `SELECT … FOR UPDATE` seat lock inside the
tx (`coaching.ts`). No IDOR.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] One parent/child can take MULTIPLE seats in the same group slot** — there's no
  uniqueness guard on `(coachingSlotId, childId)`; only total non-cancelled count is checked. For a
  group slot (capacity N) the same child can be booked N times, raising N invoices and monopolising the
  session. Single-actor logic gap (not a race). If a child should appear once: add an under-lock
  `select 1 … where coachingSlotId=? and childId=? and status!='cancelled'` guard + a partial unique
  index. (Product call on whether repeat booking is ever valid.)
- **[Decision][LOW] Server doesn't enforce `format='group' ⇒ capacity>1`** (dup of 31-1) — client-only;
  direct API can create group+capacity-1, silently behaving as 1:1.

## Deferred / tracked
- **[Defer][LOW] Booking page copy hard-codes "1:1"** even for group offerings (the page is reused);
  seats badge renders correctly, only the heading/empty-state copy is wrong. Cosmetic.

## Dismissed
oversell race (FOR UPDATE + re-count present); cancelled bookings excluded from seat count; payment/reminder reuse.
