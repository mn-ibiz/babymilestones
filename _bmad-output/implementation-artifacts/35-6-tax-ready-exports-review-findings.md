# Review findings — P5-E05-S06 (tax-ready exports)

Sweep review 2026-06-03. Epic commit. Tax report (taxable / VAT / exempt) + CSV/HTML export.
**Two patches applied.** Finance-role gated + audited; VAT total = Σ(line_tax); voids + their originals
excluded. Output-VAT total matches the authoritative per-line `lineTax` (consistent with the Epic 32 fix).

## Patched this review
- **[Patch][HIGH] Per-month breakdown dropped the final month for any mid-month `toDate`** — incl. the
  DEFAULT first-of-month..today range (so every default mid-month load showed an EMPTY breakdown while
  the Total row was populated → `Σ(months) ≠ Total`, reconciliation broken). Root cause: `monthsInRange`
  is half-open on first-of-month but the exclusive bound was `nextDayStart(toDate)`, which only crosses
  the month boundary on a month-end `toDate`. Fixed to pass the first day of the month AFTER `toDate`.
  Two regression tests added (mid-month cross-month range; within-one-month mid-month range). catalog
  tax-report(8) green.
- **[Patch][MED] Added the 366-day range cap** to `taxReportQuerySchema` (was the only missing one in
  this surface) — prevents an unbounded scan of receipts + receipt_lines. Mirrors the siblings.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Zero-rated and VAT-exempt supplies are merged into one "exempt" bucket** — different
  KRA VAT-3 boxes (zero-rated is taxable at 0%, exempt is not taxable). `receipt_lines` stores only
  `line_tax` (no `tax_treatment`), so the report literally can't separate them today. AC1 only names
  "exempt", so it's spec-compliant — but flag for the accountant: either accept + document, or persist
  `tax_treatment` on receipt_lines (additive migration) to split them.
- **[Decision][LOW] A standard-rated line whose VAT rounds to 0 cents** (sub-3-cent totals) is bucketed
  as exempt (classification keys on `line_tax !== 0`, not treatment). Negligible magnitude; same root
  cause (no persisted treatment). Output-VAT total is unaffected.

## Deferred / tracked
- **[Defer][LOW] UTC vs EAT period boundaries** — sales near Nairobi midnight fall in the wrong tax
  day/month. Codebase-wide convention (revenue read model identical); fix cross-cuttingly.

## Dismissed
authz (finance-gated); VAT total = Σ(line_tax); voids + originals excluded; CSV formula-injection guard present.
