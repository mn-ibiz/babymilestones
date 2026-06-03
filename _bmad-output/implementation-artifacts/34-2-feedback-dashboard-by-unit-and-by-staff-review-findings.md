# Review findings — P5-E04-S02 (feedback dashboard by unit and by staff)

Sweep review 2026-06-03. Epic commit. **One patch applied. ✅ Strong story.** AC1–AC3 implemented &
tested: per-unit count/avg/distribution, per-staff avg WITH a min-sample-size guardrail (small-N
suppression — good), date-range filter, drill-to-responses anonymised by default with an audited
admin de-anonymise reveal. Authz admin-gated.

## Patched this review
- **[Patch][MED] Feedback dashboard query schemas now cap the date range at 366 days.** Both
  `feedbackDashboardQuerySchema` and `feedbackResponsesQuerySchema` enforced only `from<=to` with no
  upper bound, while every sibling report (reconciliation/revenue-by-period/float-vs-revenue) caps at
  366 — so an admin could trigger an unbounded full-table feedback scan (no `submitted_at` index).
  Added the same `reconciliationExportDayCount(...) <= 366` refine to both. contracts(111) + api
  feedback-dashboard(10) green.

## Deferred / tracked
- **[Defer][LOW] Dashboard buckets by UTC calendar day, not the business EAT (UTC+3) day** — a fixed
  3-hour boundary skew. **Codebase-wide convention** (operations/repeat-attendance/cohort reports all do
  the same) — fix consistently across all `*-db.ts` reports, not here alone.
- (Follow-up) An additive `feedback_submitted_at_idx` would back the windowed scan once volume grows.

## Dismissed
authz (admin-gated); avg math + divide-by-zero guard; min-sample suppression present; anonymised-by-default + audited reveal.
