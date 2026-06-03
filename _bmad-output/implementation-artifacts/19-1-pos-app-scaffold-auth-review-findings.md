# Review findings — P2-E04-S01 (POS app scaffold + auth)

Sweep review 2026-06-03. Commit `cec27873` (epic-level). SSO/edge middleware, CSRF, role-landing sound.
**Fixed 2 BLOCKER IDORs.**

## Patched this review
- **[Patch][BLOCKER] POS sales route gated only on `create payment`** (held by `parent`, shared session
  store) — a parent could drive the till: create sales, decrement stock, mint receipts, debit any
  phone-matched wallet. Added the `isStaffRole` gate to `pos/sales.ts` authorize().
- **[Patch][BLOCKER] POS cash-up route had the same hole** → added the `isStaffRole` gate to
  `pos/cashup.ts`. (`products.ts`/`online-orders.ts` gate on `read product`, which parent lacks — safe.)
  api(46 POS) green; typecheck clean.

## Dismissed
Idempotency-key-clears-on-failure (correct); render-time client gate (`canTakePayment`) is defense-in-depth (API authoritative).
