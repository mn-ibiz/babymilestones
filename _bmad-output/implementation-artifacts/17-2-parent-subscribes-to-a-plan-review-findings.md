# Review findings — P2-E02-S02 (parent subscribes to a plan)

Sweep review 2026-06-03. Commit `99caa7fc`. IDOR-safe (wallet/child from session), double-subscribe
fenced (partial unique index `WHERE status='active'` + create-first-then-debit keyed on `subscription:<id>`),
amount correct, `addPeriod` month-end-clamped. AC1–AC3 tested. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Auto-credit parents can subscribe with insufficient funds** (negative wallet) —
  `debit()` returns `settled_on_credit`, route only rolls back on `outstanding` → 201 on wallet debt,
  bypassing AC2 pre-pay. Decide if subscriptions must be strictly pre-paid.
- **[Decision][MED] Subscription charge recorded as a `checkin` settlement + audited as
  `wallet.checkin_debit`** → reporting keyed on linkage kind / that action miscounts subscriptions as
  check-ins. Add a `subscription` debit tag, or key reporting off `ledger.source`.
- **[Decision][MED] Concurrent top-up FIFO-settling the pending subscription invoice → 500** (sub
  active + charged once, but no SMS/audit, API 500). Create+debit in one tx, or detect settled-by-FIFO.

## Deferred / tracked
- **[Defer] AC4 loyalty-earn not implemented** (loyalty ledger landed after this commit; wire in P2-E05).
- **[Defer] UTC "today" price resolution** (system-wide timezone decision); route audit outside tx.

## Dismissed
`currentPeriodStart=now` instant (correct); retry double-charge (stable idempotency key); nullable serviceId FK.
