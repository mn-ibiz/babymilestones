# Review findings — P1-E08-S02 (receipt writer interface)

Single self-review of the diff. No BLOCKER/high-severity findings (none fixed
inline beyond what the gate required). Lower-severity items deferred below.

## Deferred (low severity)

1. **Sequence allocation is read-then-insert (MAX(sequence_number)+1).** Under
   true concurrency on the same `series`, two writers could read the same MAX
   and collide. The `(series, sequence_number)` UNIQUE constraint (migration
   0032) is the backstop — the second INSERT fails rather than duplicating — so
   correctness holds, but there is no retry/serialization yet. Acceptable for
   the pre-eTIMS local writer (POS posts receipts serially, and the prod
   `Database` handle is still PGlite-typed per `packages/db/src/client.ts`).
   When the prod postgres client lands, wrap allocation in a transaction with
   `SELECT ... FOR UPDATE` on a per-series counter or use an advisory lock /
   sequence. Revisit with P5-E02 (eTIMS) or whenever the prod DB wiring lands.

2. **Caller computes line VAT.** `writeReceipt` stores `lineTax`/`lineTotal` as
   given; it does not derive VAT from the service `tax_treatment`. This is
   intentional for the *interface* story (S02) — VAT computation belongs to the
   render/charge path — but a future helper that maps a service + qty to a
   `WriteReceiptLine` (applying `tax_treatment`) would prevent callers from
   hand-rolling tax math. Track alongside the PDF render story (S03).
