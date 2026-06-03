# Review findings — P2-E04-S03 (cart + line discounts + overall discount)

Sweep review 2026-06-03. Commit `cec27873` (epic). **Strong:** server recomputes totals from DB prices
(client prices never trusted); no negative line totals (`Math.max(0,…)`); discount clamped 0–100%;
overall-KES capped at cart total; `subtotal − discount + VAT = total` held across 200k fuzzed carts;
integer-cent largest-remainder sums exactly. AC1–AC4 tested. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH · money] Flat-KES overall discount over-discounts `vat_exclusive` lines by the VAT
  fraction.** The KES discount is distributed across line weights in inconsistent frames (net for
  exclusive, gross otherwise) and subtracted in each line's native frame → "KES 100 off" removes 116c
  on a vat_exclusive line; entered/displayed/actual gross reduction diverge on mixed carts. % discounts
  are correct. Decide the intended (likely gross) frame. `packages/contracts/src/pricing.ts:96-157`.
- **[Decision][MED] No discount cap/authorization, and the discount isn't audited.** Any cashier can
  zero a sale; `pos.sale.paid` records only `total_cents`. Add a per-operator cap / manager approval
  (product call) AND record the discount in the audit payload (cheap, unambiguous).

## Dismissed
Server recompute correct; negative/over-100% clamps; integer-cent distribution; tax-per-treatment mirrors catalog.
