# Review findings — P1-E03-S04 (top-up applies FIFO to outstanding invoices)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `ce0021625e`.
FIFO ordering, integer-cent math (allocations sum exactly, no penny loss), and append-only
ledger discipline all correct; AC1–AC5 tested. **One BLOCKER fixed (money loss).**

## Patched this review

- **[Patch][BLOCKER] Concurrent top-ups double-paid the same invoice (money loss).**
  `packages/wallet/src/settle.ts` — `applyTopup()` ran in a transaction but took **no row lock**,
  and the credit-key dedup only catches identical keys. Two top-ups for the same parent with
  different keys (e.g. a cash top-up and an M-Pesa callback) raced: under READ COMMITTED both read
  the same `pending` invoice, both posted a −800 debit (distinct keys), both closed it → the wallet
  was debited 1600 for an 800 invoice. The sibling `debit.ts` already established the fix; the
  partial UNIQUE index (0014) only fences `kind='checkin'`, never the `kind='topup'` settlement rows.
  Fixed by taking `SELECT … FOR UPDATE` on the wallet row after the credit insert, before the FIFO
  scan — top-ups and check-ins on the same wallet now serialise. All 133 wallet tests green.
- **[Patch][LOW] Opaque `existing!` non-null assertion on the replay re-fetch** → replaced with an
  explicit "conflict but no existing row found" guard, matching `post()`.

## Decision needed (collected — see DECISIONS-NEEDED.md)
- **[Decision][MED] Idempotent replay returns `settled:0, residual:0`** instead of the original
  figures; these are surfaced onto cash/bank receipts (`CashCharge.settled/residual`), so a replayed
  top-up reports misleading 0s. Ledger itself is correct. Needs a replay-contract decision.

## Deferred / tracked
- **[Defer] A `pending` invoice with `amount_due=0` is never closed** by the FIFO loop (`continue`
  skips it). Shouldn't arise in normal flow; depends on invoice-creation rules.
- **[Defer][test-gap] True multi-session concurrency unverified** — PGlite is single-connection, so
  the fix's race protection can't be exercised in-suite. Add an integration test against real Postgres.

## Dismissed
Deterministic UUID tie-break (per spec); no float rounding; audit at caller layer; balance computed-not-stored.
