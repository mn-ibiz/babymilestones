# Review findings — P2-E01-S04 (reception books on behalf of a walk-in)

Sweep review 2026-06-03. Commit `1667799008`. Capacity/atomicity reuse the clean `bookSlot` engine.
**Fixed a BLOCKER IDOR.**

## Patched this review
- **[Patch][BLOCKER] Reception booking routes were NOT staff-only.** Both `requireBookingStaff` (read
  endpoints) and `POST /reception/bookings` gated only on `requirePermission("create","payment")` —
  but the `parent` role holds `create payment` (for self-initiated M-Pesa) and shares the session
  store. A logged-in parent could enumerate ANY family's children (PII) and book a slot against ANY
  parent's wallet (debt). Added an `isStaffRole` gate to both (mirrors the sibling reception routes
  I fixed in Epic 5) + a parent→403 regression test. reception booking(13) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC3 attribution unreachable from the shipped UI** — `confirm()` never sends
  `staffId`, so attribution-required services can't be booked end-to-end (server enforcement correct).
- **[Decision][LOW] Staff attribution on a non-attribution service isn't role-validated** (latent
  mis-attribution into commission data).

## Dismissed
UTC slot clock; duplicated availability serialization; admin edge middleware (API is enforcement point).
