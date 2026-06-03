# Review findings — P5-E05-S02 (cohort retention by signup month)

Sweep review 2026-06-03. Epic commit. **No code patch (decisions + a deferred perf item).** The triangular
signup-month × months-since matrix + % active is implemented & tested; admin/treasury-gated.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC2 "active = ≥1 paid touchpoint in the last 30 days" is implemented as
  calendar-month membership; `ACTIVE_WINDOW_DAYS=30` is dead code.** A defensible cohort metric, but not
  the literal AC, and the named "30-day" knob is non-functional + the `activeDefinition` query param is
  a no-op stub. Accept calendar-month + delete the misleading constant, or implement the rolling window.
- **[Decision][LOW] No small-N suppression** — a cohort of 1 publishes that individual's monthly
  activity (0%/100%) to admin/treasury. Internal audience lowers risk; decide suppress-below-N vs accept.

## Deferred / tracked
- **[Defer][MED] Active-signal query is an unbounded full scan of `wallet_ledger`** (all debits, all
  parents, all time — no date upper bound, no parent restriction, no supporting index; rows discarded in
  JS). Result-correct but a scan that grows with lifetime ledger volume, unlike the sibling reports.
  Bound `created_at < monthAfter(asOf)` + restrict to in-range parents (result-preserving). Tracked as a
  perf fix rather than auto-applied to avoid risking a money-report query change under the sweep.
- **[Defer][LOW] UTC vs EAT month bucketing** — codebase-wide convention; fix across all reports together.
- **[Defer][LOW] `activeDefinition` validated but not forwarded** — acceptable forward-compatible stub.

## Dismissed
authz (admin/treasury-gated); matrix/divide-by-zero handling; % rounding.
