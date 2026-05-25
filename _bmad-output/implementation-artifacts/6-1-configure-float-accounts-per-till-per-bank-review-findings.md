# Review findings — P1-E06-S01 (configure float accounts)

Single self-review pass. BLOCKER/high findings were fixed inline before commit;
the items below are lower-severity follow-ups (not acted on further).

## Deferred (low/medium severity)

1. **AC3 top-up tagging not wired into the live top-up routes (medium).**
   The foundation is complete and tested: `wallet_ledger.float_account_id`
   (nullable, additive), `post({ floatAccountId })`, and
   `resolveFloatAccountId(db, method)` (method → kind → oldest active account).
   However, the production credit paths (cash/M-Pesa/Paystack/bank top-ups) post
   via `@bm/payments` adapters → `applyTopup`, not the bare `post`, so they do
   not yet thread `floatAccountId` through. Wiring it requires threading the tag
   through `applyTopup` + each payment adapter — a cross-package change with its
   own regression surface, deferred to keep this story's blast radius contained.
   The column is nullable so untagged top-ups remain valid; reconciliation
   (P1-E06-S02) can resolve/group on it once wiring lands. Tracked as the next
   increment.

2. **Migration backfill (rows-present branch) has no automated test (low).**
   `createTestDb()` applies migration 0025 on an empty ledger, so the
   `DISABLE TRIGGER … UPDATE … ENABLE TRIGGER` backfill branch is exercised only
   on the empty path. The branch is guarded (`IF EXISTS … WHERE float_account_id
   IS NULL`) and idempotent, and the trigger is re-enabled before commit, but a
   dedicated test that seeds ledger rows *before* the ALTER would raise coverage.
   Low severity: P1 deploy backfill is empty per the spec.

3. **`kind` is immutable on update by design.** The update contract omits `kind`
   (changing it would re-bucket reconciliation history). Documented in the
   schema; flagged here in case a future story wants a guarded re-kind flow.
