# Review findings — P2-E01-S07 (bookings list on parent dashboard)

Sweep review 2026-06-03. Commit `031cebe9`. IDOR correct (query filters `bookings.parentId =
session profile.id`, no client param); status/ordering correct; no sensitive over-fetch. No code change.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Bookings list is unbounded** — no `LIMIT`/pagination, unlike every sibling parent
  list (loyalty 100, observations/wallet caps). History grows across all epics. Choose a fixed bound
  or cursor pagination (how much past history to surface is a product call).

## Deferred / tracked
- **[Defer][test-gap] No cross-parent isolation test** — code is correct (session-scoped) but only the
  single-parent happy path is tested. Add a 2-parent test asserting A never sees B's booking.
- **[Defer] Salon/coaching/legacy bookings dropped** by the `slotId` inner-join (NULL slotId excluded).
  Confirm whether the dashboard should union all booking types.

## Dismissed
Middleware `/book` regex fix; nullable lastName; UTC today/nowMinutes; cutoff/past helper reuse.
