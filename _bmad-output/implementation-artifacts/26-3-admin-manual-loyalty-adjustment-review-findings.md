# Review findings — P3-E04-S03 (admin manual loyalty adjustment)

Sweep review 2026-06-03. Epic-level commit. **Authz solid** (`manage loyalty` → admin/super_admin only;
reception/cashier 403, anon 401, CSRF enforced — tested); integer points; zero rejected; reason
required; append-only trigger; target must be a parent. This is the live route. AC1–AC4 implemented.

## Patched this review
- **[Patch][HIGH] Adjustment `reason` was validated + audited but never written to the ledger row** —
  the `reason` column existed (added for this story) but the insert omitted it (left NULL), so the
  ledger itself didn't record WHY points changed. Added `reason: reason.trim()` to the insert.
  `packages/wallet/src/loyalty-adjust.ts`. wallet(22 loyalty) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Ledger insert + audit not atomic** — a failed audit leaves an unaudited committed
  adjustment (the append-only trigger means it can't be cleaned up). Wrap insert+audit in one tx
  (thread `tx` into `adjustLoyaltyPoints`, mirror `earnPointsV2`).

## Deferred / tracked
- **[Defer] Non-atomic balance read→insert** can stale the derived `negativeCarry` flag (not a money
  bug — balance is always ledger-derived; pre-existing pattern).

## Dismissed
self-grant / body-injection (parentId from URL, posted_by from session, staff target 404); integer/bounds/reason all enforced.
