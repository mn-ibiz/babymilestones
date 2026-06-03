# Review findings — P3-E05-S02 (revenue by unit by period)

Sweep review 2026-06-03. Epic-level commit. SQL-injection clean (parameterised); authz tested
(admin/treasury 200, accountant/reception 403, export audited); integer cents. AC1–AC3 met.

## Patched this review
- **[Patch][HIGH] No max-days cap on the range schema** — the lone Epic-27 date report without one;
  an unbounded range triggered two huge bookings+ledger scans (resource/DoS). Added
  `REVENUE_BY_PERIOD_MAX_DAYS=366` + a refine (mirrors the reconciliation/peak-hours caps). contracts/api green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Refund counted on a cancelled/excluded booking** can drive a unit's NET revenue
  negative (gross excludes cancelled; refund join doesn't). Symmetric filter, or document negative NET.
- **[Decision][MED] Revenue is INVOICED (`staffRateSnapshot`), not settled** → doesn't reconcile to the
  wallet ledger; inflates for unsettled/subscription bookings. Same as S01; label or base on settled.

## Deferred / tracked
- **[Defer] UTC period boundaries** vs EAT (#17).

## Dismissed
precedingPeriod DST-correct; refund sign via Math.abs; CSV header injection blocked by date regex.
