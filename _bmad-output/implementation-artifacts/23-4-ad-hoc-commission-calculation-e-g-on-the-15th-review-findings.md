# Review findings — P3-E01-S04 (ad-hoc commission calculation)

Sweep review 2026-06-03. Commit `45fe5dae` (epic). Anti-double-count design (claim via `run_id IS NULL`)
correct sequentially; AC1–AC3 tested; admin-only; half-open period validation. **Fixed a money BLOCKER.**

## Patched this review
- **[Patch][BLOCKER · money] Concurrent runs double-paid the same ledger entry.** Run lines/totals were
  built from a PRE-claim aggregate SELECT, not the rows actually claimed. Under READ COMMITTED two
  overlapping runs (ad-hoc+ad-hoc, or ad-hoc racing the monthly job) both included entry X in their
  totals while only one stamped it → X paid in BOTH runs. Fixed `createCommissionRun` to **claim first
  with `.returning()`** and aggregate the returned rows — totals are now consistent with what was
  claimed (no double-pay, and also fixes the S03 claim-but-not-pay race). catalog(18)+api(16) green.
- **[Patch][MED] `mark-paid` was not idempotent** — its WHERE omitted the `isNull(paidOutAt)` guard its
  own comment promised, so a double-click double-audited + overwrote `paid_out_at`. Added
  `and(eq(id), isNull(paidOutAt))` + early-return-alreadyPaid when 0 rows transitioned.

## Deferred / tracked
- **[Defer] Ad-hoc run audit written outside the run tx** (pre-existing commit-then-audit pattern).

## Dismissed
empty-run-on-double-submit harmless (claim zeroes the 2nd); preview/confirm divergence (advisory).
