# Review findings — P3-E03-S05 (salon-specific reporting tile)

Sweep review 2026-06-03. Epic-level commit. Integer cents; authz `read report`
(admin/accountant/treasury; reception 403); PII-safe projection (no child names, unlike the counter
board); AC1/AC2 tested (reducer 8/8). No code change.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Tile "total revenue" counts no-show / never-settled bookings** (sums
  `staffRateSnapshot` for all non-cancelled bookings, settled or not) → overstates *realized* revenue
  vs the wallet ledger (a no-show's pending invoice is never debited). Documented as intentional and
  matches the operations dashboard. Decide: keep "invoiced revenue" (+label it) or sum settled only.

## Deferred / tracked
- **[Defer] UTC slot-time / "today"** for an EAT business (systemic; consistent with ops dashboard).

## Dismissed
invalid-but-regex-valid date → empty report (non-crashing); staffName snapshot fallback; no-show via NOT NULL checkedInAt.
