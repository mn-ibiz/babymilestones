# Review findings — P4-E05-S05 (door check-in via ticket code or manual list)

Sweep review 2026-06-03. Epic-level commit. Authz correct (`manage service`, staff-only; reception 403);
no ticket-code public lookup (no brute-force surface — only staff-gated check-in; codes crypto-random);
queries scoped by `eventId` (no cross-event leak); parameterized search. AC1/AC3/AC4 met. **Fixed the
double-admit race.**

## Patched this review
- **[Patch][HIGH] Double-admit TOCTOU.** The check-in read status then UPDATE'd by `id` only — two
  concurrent scans of the same code both passed the read-side guard and both admitted (+ double audit).
  Gated the UPDATE on `status='issued'` (returning); a 0-row result re-reads and reports the current
  state (already-checked-in/cancelled) instead of double-admitting. api door(6) green.

## Deferred / tracked
- **[Defer] `checkedInBy` has no FK to users** (pre-existing schema; additive migration could add it).

## Dismissed
authz (manage service); no public code-lookup/brute-force; event-scoped queries (no leak); parameterized search.
