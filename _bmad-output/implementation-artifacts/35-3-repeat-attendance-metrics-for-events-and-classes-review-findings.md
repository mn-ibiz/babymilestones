# Review findings — P5-E05-S03 (repeat-attendance metrics for events and classes)

Sweep review 2026-06-03. Epic commit. **One patch applied.** Per-class table (total attendees, % attended
another class, avg classes) + date filter implemented & tested; admin-gated.

## Patched this review
- **[Patch][HIGH] Added the 366-day range cap** to `repeatAttendanceQuerySchema` — it was the only report
  in this surface with no cap, so an unbounded range forced a full scan of `attendances` + `tickets`
  (neither `checked_in_at` indexed) + an all-rows in-memory aggregation (DoS/cost vector). Mirrors the
  sibling reports. contracts repeat-attendance(…) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Soft-deleted events are still counted** — the event-tickets query joins `events`
  without `isNull(events.deletedAt)`, diverging from every other event read. A door-checked-in ticket on
  a since-deleted event still inflates the metrics. The attendance physically happened (arguably keep
  it), but it contradicts the house convention — confirm intent.
- **[Decision][LOW] Attendee identity is un-normalised phone strings** — class identity is the canonical
  `users.phone` but event identity is the free-text guest `tickets.buyerPhone`; they unify only by exact
  string equality. A parent who buys a ticket as `0700…` vs login `+254700…` is double-counted and
  cross-surface repeats are under-counted. Normalise both to a canonical phone, or document the limit.

## Dismissed
authz (admin-gated); distinct-attendee counting + repeat % denominator; join fan-out.
