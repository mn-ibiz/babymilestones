# Review findings — P4-E04-S02 (order status transitions sync back)

Sweep review 2026-06-03. Epic-level commit. State machine rejects illegal transitions; local
transition + order_events + outbox enqueue are atomic with NO synchronous Woo call (survives a Woo
outage); retry/backoff/dead-letter correct. AC1–AC6 implemented & tested. No code change.

## Decision needed (see DECISIONS-NEEDED.md — order-note idempotency)
- **[Decision][HIGH] Order-note retry is non-idempotent** (the named open follow-up, CONFIRMED) —
  `updateOrderStatus` is a status PUT (idempotent) then a note POST (append-only). On any failure after
  the PUT lands, the retry re-POSTs the note → DUPLICATE Woo notes, up to 5×. The outbox idempotency
  key only dedupes enqueue. Choose: split the note into its own outbox kind; or dedupe by note marker.
- **[Decision][LOW] AC3 "configurable" status map is a dormant hook** — only defaults are reachable.

## Deferred / tracked
- **[Defer] Outbox claim no row lock** (single-worker; see S07).

## Dismissed
state-machine validity; atomic local write; retry/backoff/dead-letter.
