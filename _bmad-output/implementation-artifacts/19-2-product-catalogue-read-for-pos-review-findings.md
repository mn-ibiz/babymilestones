# Review findings — P2-E04-S02 (product catalogue read for POS)

Sweep review 2026-06-03. Commit `cec27873` (epic). **✅ Clean.** Price from server (integer cents, DB
`CHECK(price_cents>=0)`; client carries only id/qty/discount — tampering closed); stock correct +
guarded decrement; authz `read product` (reception/cashier/packer, parent excluded); parameterized
ILIKE search. AC1–AC3 tested.

## Deferred / tracked
- **[Defer] Cart can display a stale unit price** if the DB price changes between add-to-cart and Pay
  (S04 UX gap — the sale always recomputes server-side, so no wrong-charge). Echo server prices /
  confirm-on-change in S04.

## Dismissed
client `canTakePayment` duplicates RBAC (defense-in-depth); search min-length API(1) vs catalog(2) (returns []); `stock_qty` no CHECK (guarded decrement).
