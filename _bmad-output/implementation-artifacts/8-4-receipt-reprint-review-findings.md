# P1-E08-S04 Receipt reprint — review findings (follow-up log)

Single self-review of the diff. No BLOCKER/high-severity findings; gate green
(test + typecheck + lint + build). Items below are deferred, lower severity.

## Deferred

- **[low] Dedicated receipt-engine reprint UI hook (Task 2).** The reception
  transaction-history surface already exposes a "Print" + "SMS" receipt action
  pair on every history row (P1-E05-S06, `apps/admin/app/reception/page.tsx`
  via `apps/admin/lib/receipt.ts`), satisfying AC1 from the user's point of
  view. The new byte-identical receipt-engine endpoint
  (`POST /receipts/:id/reprint`) is keyed off the immutable receipt id rather
  than the wallet-ledger transaction id; wiring a second front-end button for
  it would duplicate the existing reception flow. Deferred to avoid
  gold-plating — the API + audit + re-SMS path is fully implemented and tested.
  A thin admin/POS button calling the new endpoint can be added when the
  receipt-engine history view (separate from the reception payment flow) lands.
