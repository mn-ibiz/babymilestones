# Review findings — P3-E02-S02 (earnings breakdown — visits, top services)

Sweep review 2026-06-03. Commit `c5954575` (epic). Both ACs implemented & tested: breakdown carries
only service names + numbers (no parent/child/booking PII; left-join keeps ids out, tested); ledger
query scoped to the single `staffId` (no cross-stylist leak); integer cents; half-open UTC window
matches the headline total. catalog(495) green. No code change.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Breakdown visit-count ignores `source='reassign'`** (a later-epic source, migration
  0090) → undercounts the new stylist's visit and the old stylist shows "1 visit / ~0 revenue".
  Revenue + headline totals stay correct; only the visit-count metric diverges. Cross-epic interaction
  (reassign landed after this story). Decide counting semantics (count reassign for the new stylist, or
  count by current `bookings.staffId` like the leaderboard) + add a reassign regression test.

## Dismissed
bigint→number overflow (unrealistic); middleware startsWith (S01 scope); raw service.name (staff-facing, P5 discreet-billing epic); no join fan-out.
