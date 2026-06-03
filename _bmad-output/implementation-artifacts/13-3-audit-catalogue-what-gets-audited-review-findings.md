# Review findings — X5-S03 (audit catalogue — what gets audited)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `c5ae768c`.
**Catalogue is complete** — an independent re-scan found 0 emitted `audit()` actions missing from it;
all security/money-sensitive actions (signup, login(.failure), reset, pin change, role changes,
`rbac.impersonate`, ledger postings, `wallet.refund`, `receipt.voided`, consent) are catalogued &
emitted. `payload` is free-form (no sensitive field mandated). AC1–AC3 implemented & tested.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Catalogue enforcement leans on a static-scan test blind to non-literal actions.**
  Only ~11/176 `audit()` sites wrap the action in `auditAction()`; the rest pass raw literals, and the
  completeness scan can't resolve a variable action (1 such site today — `pos/order-transitions.ts` —
  both values happen to be catalogued). A future variable-action site with an uncatalogued value would
  silently bypass the only guard. **Choose:** accept the documented tradeoff, or harden (lint rule
  requiring literal/`auditAction()`-checked actions, or fail CI on unresolved scan sites).

## Deferred / tracked
- **[Defer] Completeness scan `walk()` uses `statSync`** with no per-entry try/catch → a broken symlink
  would crash the test (no symlinks exist today). Use `lstatSync`/try-catch if touched.

## Dismissed
AC3 forbidden-regex `get`/`fetch` breadth (no catalogued action matches); `row.action` re-projection
sites; `def.action` POS action-sheet key (not an `audit()` call).
