# Review findings — P1-E04-S06 (cash top-up by reception)

Single self-review of the diff. No BLOCKER/high-severity findings; the items
below are lower-severity follow-ups deferred from this story.

## Deferred (low / out-of-scope for the API+ledger slice)

1. **Reception cash top-up UI (Task 3, AC1 front-end)** — the `apps/admin`
   select-parent → enter-amount → confirm screen is not built here. The
   server contract (`POST /payments/cash/topup`) is complete and tested; the UI
   is a thin client over it and belongs with the Reception console surface
   (P1-E05). Marked `[~]` in the story.

2. **Physical receipt print (Task 4)** — there is no receipt/print service in the
   current scaffold (P1-E05). AC3's receipt is satisfied at launch by the
   transactional SMS-stub (`template: "wallet.topup.cash"`); wiring an actual
   printer/PDF is deferred to the receipt epic. Marked `[~]`.

## Notes (no action needed)

- FIFO settlement keys on `invoices.parent_id` → `parents.id`, so the route
  resolves the parent *profile* id before calling the adapter, while the audit
  payload records the parent *user* id. Both are intentional and consistent with
  the existing M-Pesa callback path.
- `source='cash:reception'` is exported as `CASH_RECEPTION_SOURCE` and pinned by
  tests; Treasury reconciliation (P1-E06) must read this exact string.
