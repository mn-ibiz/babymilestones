# Review findings — P2-E01-S02 (parent browses available slots)

Sweep review 2026-06-03. Commit `28123d4e`. Capacity computed correctly (cancelled excluded, clamped),
no other-parent data leak (counts only; child-ownership 404), age filter tested. No code change.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] In-progress slot (started, not ended) still shown bookable** — `isSlotPast` keys on
  END time. AC3 ("today's earlier slots disabled") arguably means START. Dev says "a running session
  is joinable." Confirm intent.

## Deferred / tracked
- **[Defer] AC3 "today"/"earlier today" computed in UTC, not EAT** — latent day/3h drift in the
  00:00–03:00 EAT window; system-wide convention (cross-cutting timezone decision).

## Dismissed
AC4 p95 unmeasurable (index-backed); ZodEffects wrapping; no N+1; admin one-sided-PATCH range (guarded).
