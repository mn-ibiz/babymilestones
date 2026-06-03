# Review findings — P2-E07-S01 (outstanding-balance banner on parent dashboard)

Sweep review 2026-06-03. Commit `d487083c`. IDOR clean (`/parents/me/wallet`, session-scoped); XSS
clean (only `formatKes` integer output); banner compound + island well-tested. AC1/AC2 met; AC3 met
for the normal path. No code change (findings are the cross-cutting `settled_on_credit` decision).

## Decision needed (see DECISIONS-NEEDED.md, links to #14)
- **[Decision][HIGH] AC3 violated for the auto-credit overdraw path.** A `settled_on_credit` invoice
  keeps a non-zero `amount_due` that no settlement ever clears, and the banner's outstanding sum
  (`NOT IN ('settled','void')`) includes it — so a top-up never removes the banner for an auto-credit
  parent. Same root as the P1-E05-S02 double-count (#14), now with AC3 teeth. Fix consistently across
  `wallet.ts`, `parent-profile.ts`, `parents-search.ts`: exclude `settled_on_credit` from outstanding,
  or have settlement clear it.

## Deferred / tracked
- **[Defer] `settled_on_credit` debt double-counted** (negative balance AND outstanding) — now shown to
  parents on every page. Same root as above.

## Dismissed
IDOR (session-scoped); XSS (formatKes); CTA `/top-up` exists.
