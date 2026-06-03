# Review findings — P1-E06-S04 (export float reconciliation for the accountant)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `16eeb1b3`.
Authz correct (admin/treasury/accountant only; reception 403); numeric totals match the live
float-liability model (integer cents); audit written; date validation + 366-day cap tested.

## Patched this review
- **[Patch][HIGH · security · repo-wide] CSV formula injection.** The float account `account` name is
  user-controlled free text; the shared `csvField` did RFC-4180 quoting only, so a name like
  `=cmd|'/c calc'!A1` executes as a formula when the accountant opens the CSV. Hardened **all three**
  `csvField` copies (`packages/contracts`, `packages/catalog/commission-run`, `packages/wallet/statement`)
  with a numeric-aware guard: prefix a leading `= + - @ \t \r` cell with `'`, EXCEPT plain numbers so
  signed money (`-500.00`) is preserved. Added a regression test. Fixes every CSV export repo-wide and
  resolves the cross-cutting item flagged in Epic 3. 418 contracts tests green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] `real_balance`/`drift` are reconstructed from approved adjustments**, not the
  operator-entered real count (which is never persisted). An uncorrected real-world drift shows as
  `drift=0` / fully reconciled. Same-named live-screen columns mean something different. Choose:
  rename/annotate the columns, persist the real balance per day, or drop the columns.
- **[Decision][LOW] Adjustment sign convention** (`real = system + Σ adjustments`) is assumed but
  never pinned — if operators enter `system − real` instead, every export's real/drift is inverted.

## Deferred / tracked
- **[Defer] Opening balance applied to every day** (ignores `openingDate`) + UTC day-bucketing for an
  EAT business — consistent with the live float model; resolve under the finance-timezone decision
  (same as the P1-E03-S08 statement `to`-date item).

## Dismissed
Authz, numeric accuracy, audit, date validation all verified correct.
