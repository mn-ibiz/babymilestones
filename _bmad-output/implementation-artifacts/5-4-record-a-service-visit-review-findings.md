# Review findings — P1-E05-S04 Record a service visit

Single self-review pass. No BLOCKER/high-severity findings. Lower-severity items
logged here for follow-up (not acted on per the one-review rule).

## Deferred (low / informational)

1. **Catalogue link deferred to P1-E07 (services + staff).** AC1's "active-only"
   service/staff pickers and the snapshot-from-catalogue are not yet wired — the
   services + staff catalogues are epic 7. The route accepts `serviceId`/`staffId`
   as opaque uuids (no FK) plus the `staffName` + `rate` snapshot fields directly,
   and the admin flow logic provides the picker order + gates. DEFERRED: load
   active-only catalogue rows and snapshot the staff name + service rate
   server-side once P1-E07 ships, and add the FKs on `bookings.service_id` /
   `bookings.staff_id`. Tasks 1, 2, 4 are marked `[~]` for this reason.

2. **Booking/invoice committed before the debit (non-atomic across the two).**
   The invoice + booking are created in one transaction, then `@bm/wallet` debit
   (P1-E03-S05) runs in its own transaction (the primitive owns its tx). On a
   freshly-created `pending` invoice with a validated wallet the debit cannot
   realistically fail, so an orphan booking is not reachable on the happy/AC4
   paths. If a future change makes debit fail mid-flow, the booking+invoice would
   persist without a resolved check-in. Low risk now; revisit if the debit
   primitive grows a `Transaction`-accepting overload so the whole flow can be one
   transaction.

3. **`reception.record_visit` audit is written after the debit (not in the same
   tx).** The debit primitive writes its own `wallet.checkin_debit` audit row
   transactionally; the extra reception-level audit is best-effort post-hoc and
   not rolled back with the booking. Acceptable for an audit trail; noted for
   completeness.

4. **No E2E browser test.** AC coverage is via contract unit tests + API
   integration tests (full pick→confirm→debit, the AC4 outstanding+warning path,
   permission/auth/ownership guards) and admin flow-logic unit tests. A Playwright
   `e2e/` walkthrough is deferred (consistent with sibling reception stories).
   Task 5's E2E sub-bullet is marked `[~]`.
