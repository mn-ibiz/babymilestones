# Review findings — P1-E05-S01 (parent search)

Single self-review pass. No BLOCKER/high-severity findings. Deferred lower-severity notes below (follow-up only — not acted on in this story).

## Low severity

1. **Mixed name+digit queries add a redundant phone OR clause.** A query like
   `Perf1000` has ≥3 "digits", so `findParents` appends a phone-prefix LIKE
   (`+2541000%`) alongside the name ILIKE. It is harmless (no false matches at
   the 10k fixture, p95 stays ≤300ms) and the OR short-circuits, but a future
   refinement could gate the phone branch on "query is mostly digits" to avoid
   the extra index probe. Deferred — no correctness or perf impact observed.

2. **Prod trigram index is unverified under PGlite.** The migration's GIN
   `pg_trgm` indexes only execute in real Postgres; the test harness exercises
   the btree `lower(name)` fallback. The trigram plan should be confirmed against
   a staging Postgres with `EXPLAIN` before the perf SLA is treated as proven in
   production (the in-test p95 uses the fallback path). Deferred to staging
   verification (DoD step 5/6).

3. **Accountant can search.** The guard is `read wallet`, which accountant (and
   admin) hold in addition to reception/cashier. This is intentional (staff-only,
   and accountants legitimately read wallet data) but is broader than "reception
   only". If the product later wants reception/cashier-exclusive search, introduce
   a dedicated `read parent`/`read reception` resource. Deferred.
