# Review findings — P3-E05-S01 (daily operations dashboard)

Sweep review 2026-06-03. Epic-level commit. Authz correct & tested (admin/super_admin/treasury;
accountant/reception 403); no parent PII. AC1–AC4 met.

## Patched this review
- **[Patch][MED] "Active sessions" count was unbounded** — any attendance ever opened but never
  checked out counted as "active" forever. Bounded to the day's check-ins (`gte/lt checkedInAt`,
  matching the sibling reads). Updated the test to seed `checkedInAt=TODAY`. api(8) green.
- **[Patch][LOW] Outstanding query missed the `amount_due > 0` guard** the wallet-aging report uses —
  added for consistency (numerically identical today).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] "Today" keyed to the UTC calendar day, not EAT** — folds into the repo-wide
  timezone decision (#17).
- **[Decision][MED] "Today's revenue" counts invoiced-not-settled + subscription bookings and never
  nets refunds** — inconsistent with S02 (which nets refunds). Billed-vs-collected product call.

## Dismissed
`void` status exclusion correct; materialised-view note satisfied by on-demand queries.
