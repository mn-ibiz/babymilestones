# Review findings — P2-E04-S04 (payment at POS: cash / M-Pesa / Paystack / wallet)

Sweep review 2026-06-03. Commit `cec27873` (epic). **No double-charge / double-fulfilment found.**
`settleSale` atomically CLAIMs `pending→paid` before receipt/stock; wallet debit keyed `pos:<saleId>`
(unique); amount = server total (Paystack re-verifies); whole sale is one transaction; guarded stock
decrement (no oversell). AC1–AC7 tested. No code change (findings are decisions/defer).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Concurrent duplicate create with the same idempotency key → 500 instead of replay**
  (TOCTOU between the replay SELECT and the INSERT). Catch the unique violation and replay.
- **[Decision][LOW] Paystack amount-mismatch fails the sale but the customer was already charged** — no
  refund/capture path.

## Deferred / tracked
- **[Defer] M-Pesa/Paystack sale orphaned in `pending` (null ref) permanently blocks retry** under the
  same key (adapter throws before the ref is set) — relates to the missing reconcile cron.
- **[Defer] Receipt SMS failure swallowed with no audit/observability.**

## Dismissed
`settleSale`/`receiptNumber!` null-assert safe; M-Pesa whole-shilling rounding guarded; failed-row
re-insert can't conflict (key nulled); client role gate backed by API permission.
