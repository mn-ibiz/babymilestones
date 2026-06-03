# Review findings — P1-E03-S03 (idempotent posting interface)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `3df9a67c`.
Core money primitive sound: idempotency arbitrated by the `idempotency_key` UNIQUE index +
`ON CONFLICT DO NOTHING` in a transaction; same-key retry returns the existing row, different
payload throws `IdempotencyConflict`. Append-only enforced at the DB layer (trigger + role REVOKE,
migration 0011); money is `bigint` cents. AC1–AC3 tested.

## Patched this review

- **[Patch][MED] `floatAccountId` excluded from the idempotency conflict comparison.**
  `packages/wallet/src/index.ts` — `post()` inserts `floatAccountId` but the same-key conflict
  check omitted it, so a retried post with a *different* float tag was silently treated as a benign
  replay (could misattribute float liability in P1-E06 reconciliation). Added
  `existing.floatAccountId !== values.floatAccountId` to the comparison. (Gap was introduced by
  P1-E06-S01 after this story; fixed here as the natural home.) Tests green.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][LOW] `post()` doesn't validate `amount`** (zero / non-integer) like sibling
  `refund()`/`loyalty()` do. The bigint column rejects float/NaN, but `amount=0` is silently
  accepted as a no-op posting that burns an idempotency key. Add a guard, or document that `post()`
  trusts callers.

## Deferred / tracked
- **[Defer][test-gap] "100 concurrent" race gate runs on single-connection PGlite** so it doesn't
  exercise true cross-session concurrency; the UNIQUE-index mechanism is still correct.

## Dismissed
Nested `post(tx,…)` savepoint safety; float/NaN can't corrupt (bigint rejects); conflict-path SELECT
visibility under read-committed.
