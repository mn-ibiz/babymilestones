# Review findings — P1-E03-S02 (3-2 balance is computed, never stored)

Single review pass. No BLOCKER/high-severity findings; all ACs covered with passing tests. Lower-severity follow-ups logged below (not acted on in this story).

## Low severity (deferred)

1. **JS `Number` precision ceiling for extreme balances.** `balance()`/`balances()`
   parse the bigint `SUM` (returned as a string by the driver) via `Number(...)`.
   This is exact for cents balances up to `Number.MAX_SAFE_INTEGER` (~9e13 cents
   = ~90 billion KES), far beyond any realistic wallet. If wallet aggregates ever
   approach that scale, switch the parse to `BigInt` and surface `bigint` cents.
   No action in P1.

2. **No materialised view / cached balance.** Intentional per Dev Notes — balance
   is always `SUM(amount)`. A materialised view is explicitly deferred to P2 if
   perf demands it. The `(wallet_id, created_at DESC)` index backs the read.
