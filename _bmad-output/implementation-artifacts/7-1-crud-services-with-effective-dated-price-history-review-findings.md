# Review findings — P1-E07-S01 (CRUD services with effective-dated price history)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `ccba586e`.
Half-open `[from,to)` pricing, future-dated-not-applied-early, append-only history, integer cents,
admin-only authz all correct & tested. **Fixed a money-correctness concurrency invariant.**

## Patched this review
- **[Patch][HIGH] Concurrent price changes could create two open price rows → non-deterministic
  booking price.** `setServicePrice` had no lock and there was no DB uniqueness on the open
  (`effective_to IS NULL`) row, so two concurrent calls could each insert an open row. Fixed with
  (a) an additive partial unique index `service_prices_one_open_per_service (service_id) WHERE
  effective_to IS NULL` (migration `0107` + drizzle schema), and (b) a `SELECT … FOR UPDATE` on the
  parent `services` row so all price changes (incl. the first) serialise. catalog(44) + api(54) green.

## Deferred / tracked
- **[Defer] Price-change audit not atomic with the price write** — `setServicePrice` opens its own
  tx then audits separately; if the audit fails the price persists unaudited. Pre-existing pattern
  across admin routes; fix by letting `setServicePrice` accept a `tx` and wrapping write+audit.

## Dismissed
Non-atomic create/update audit (same deferred umbrella); lexicographic ISO-date compare (safe,
zero-padded); `serviceUpdateSchema` "at least one field" edge.
