# Review findings — P4-E04-S07 (sync scheduler + dead-letter)

Sweep review 2026-06-03. Epic-level commit. Pull+checkpoint, outbox FIFO + bounded concurrency,
retry/backoff + dead-letter (insert-before-delete, no loss), dead-letter list/replay/resolve, health
snapshot, sync-now — all implemented & tested (woocommerce 105 green). No code change beyond the
shared lost-update guard applied under S05.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Outbox claim is not race-safe across instances** (the named "durable outbox claim
  for horizontal scale" follow-up) — `claimDueWcWritebacks` is a plain SELECT (no `FOR UPDATE SKIP
  LOCKED`, no claim-state transition); the only mutual exclusion is the in-process scheduler `inFlight`
  Set. Correct under a single jobs instance only; a 2nd replica double-dispatches. Document single-
  instance, or make the claim durable (SKIP LOCKED / lease).
- **[Decision][MED] Order-note duplication on retry** — see the order-note idempotency decision.

## Deferred / tracked
- **[Defer] Checkpoint stalls if Woo omits `date_modified`** (re-pulls same window; idempotent).
- **[Defer] 6h backoff rung is dead code** (dead-letters at attempt 5 before serving it).

## Dismissed
FIFO + bounded concurrency; dead-letter no-loss; replay/resolve/discard; health staleness.
