# P1-E11-S02 — Review findings (follow-up log)

Single self-review completed. No BLOCKER/high-severity findings; gate green
(test + typecheck + lint + build). Lower-severity items deferred below.

## Low

- **L1 — Full refetch after each mutation.** `app/(app)/children/page.tsx`
  re-runs `fetchChildren()` after add/edit/archive/restore/consent rather than
  optimistically updating local state. Fine for the MVP child counts; revisit
  with optimistic updates if the list grows large.
- **L2 — Allergies summary truncation is character-based (60 chars).** Good
  enough for cards; could move the cap to `@bm/contracts` if other surfaces need
  the same summary.
