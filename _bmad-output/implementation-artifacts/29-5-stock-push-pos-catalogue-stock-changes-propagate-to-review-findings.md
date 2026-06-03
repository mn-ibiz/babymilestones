# Review findings — P4-E04-S05 (stock push: POS catalogue → WooCommerce)

Sweep review 2026-06-03. Epic-level commit. Enqueue coalesces per-product to the final value;
absolute-value PUT; no negative local stock (guarded decrement + clamp); SKU mapping. AC1–AC6
implemented & tested. **Fixed a money/stock BLOCKER.**

## Patched this review
- **[Patch][BLOCKER · overselling] Lost update: the drain unconditionally marked a row done,
  clobbering a concurrently re-armed newer stock value.** The claim was a plain SELECT (row left
  `pending`) and `markWcWritebackDone` did `UPDATE … WHERE id=?`. A re-enqueue (POS sale / adjust, in
  the API process) arriving during the Woo PUT re-armed the row with V2 (future `next_attempt_at`); the
  drain then forced it `done`, dropping V2 → Woo left at the stale V1 (higher) → **overselling online**.
  Fixed: `markWcWritebackDone` now guards `status='pending' AND next_attempt_at = <claimed>` (a re-arm
  changes `next_attempt_at` to a future value), so a re-armed row is left pending and drained next
  cycle. Added a lost-update regression test. woocommerce(105) green. Also fixes the same race on the
  S02 order-status writeback (shared outbox).

## Deferred / tracked
- **[Defer] No DB CHECK `stock_qty >= 0`** (app clamps cover it; belt-and-suspenders).

## Dismissed
in-process overlap guard; POS post-decrement re-SELECT tx-consistent; unmapped-product no-op.
