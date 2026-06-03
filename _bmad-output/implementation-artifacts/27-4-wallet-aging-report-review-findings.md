# Review findings — P3-E05-S04 (wallet aging report)

Sweep review 2026-06-03. Epic-level commit. Buckets correct (0-7/8-30/31-60/61-90/90+, boundaries
tested, no off-by-one); integer cents; CSV-injection guarded; authz tested (accountant/admin/treasury;
reception 403). AC1–AC3 met. No code change (the one real finding is the cross-cutting settled_on_credit
issue — must be fixed consistently across all sites, not just here).

## Decision needed (see DECISIONS-NEEDED.md — links #14/#52)
- **[Decision][HIGH] Aging includes `settled_on_credit` invoices** (filter `NOT IN ('settled','void')`
  doesn't exclude them; they keep full `amount_due` forever) → the debt is double-counted AND, worse for
  an *aging* report, it never clears after repayment and drifts into 90+. Same filter platform-wide
  (`parents/wallet.ts`, `parent-profile.ts`, `parents-search.ts`, `operations-dashboard`). Resolve the
  `settled_on_credit` definition consistently everywhere (exclude it, or zero `amount_due` on transition).

## Deferred / tracked
- **[Defer] `asOf` anchored to UTC midnight** vs EAT (#17).

## Dismissed
buckets contiguous/clamped; integer cents; authz; CSV guard.
