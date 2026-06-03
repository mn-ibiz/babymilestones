# Review findings — P2-E01-S03 (parent books a slot — creates pending invoice)

Sweep review 2026-06-03. Commit `35c2acec`. **✅ Clean.** Well-built money/concurrency story.

## Confirmed correct
- **Overbooking race (AC4):** `bookSlot` does `SELECT … FOR UPDATE` on the slot row before counting
  → bookers of the same slot serialise; loser gets 409. No atomic-decrement needed (capacity is a
  computed read model). 16 integration tests pass.
- **Pending invoice (AC3):** amount from `resolveServicePriceAt` (effective-dated), snapshotted; status pending.
- **IDOR:** child ownership from session; service derived from the slot, never user input.
- **Atomicity:** booking + invoice + audit in one transaction.

## Deferred / tracked
- **[Defer] No DB-level partial unique index on `(slot_id, child_id)`** as a durable backstop (the
  row-lock makes it race-safe today; defense-in-depth, like `setServicePrice`'s paired index).

## Dismissed
UTC slot clock; age-at-now vs slot-date; functional idempotency via the locked duplicate guard; sub-second past-slot TOCTOU.
