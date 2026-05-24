# Review findings — P1-E03-S05 (debit at check-in)

Single self-review pass. No BLOCKER/high-severity issues found; the items below
are low-severity follow-ups (deferred, not fixed inline).

## Low severity

1. **Re-check-in of an `outstanding` invoice is not idempotent.**
   The `outstanding` path (AC5) posts no ledger row, so the idempotency-key
   replay guard (which keys off the debit ledger row) does not short-circuit it.
   A repeat call finds the invoice in `outstanding` status, fails the
   "must be pending" guard, and the route returns 409. This is acceptable —
   an outstanding invoice is cleared by a top-up (S04 FIFO), not by a second
   check-in — but it is an asymmetry vs. the settled paths' clean replay.
   Follow-up: if product wants idempotent re-check-in for outstanding invoices,
   short-circuit when `status='outstanding'` and the same wallet/invoice.

2. **`SELECT ... FOR UPDATE` is effectively a no-op under the PGlite test harness**
   (single connection), so the concurrency serialisation (AC2) is exercised by
   the lock being *present in the SQL*, not by a true concurrent-race test. The
   durable double-check-in fence (partial UNIQUE index, AC6) IS exercised. A
   real-Postgres concurrency test belongs in the `e2e/` suite (DoD#7) once that
   harness supports parallel connections.

3. **`service_id` has no FK** (nullable plain uuid) because the services
   catalogue (P1-E07) is not yet built. When P1-E07 lands, add the FK in an
   additive migration.

4. **Booking endpoint not implemented** — see deferred Task 1 in the story file.
   The invoice *shape* required by AC1 (pending status, amount_due, parent_id,
   service_id) is in place and exercised; the booking flow that creates it is a
   separate epic dependency.
