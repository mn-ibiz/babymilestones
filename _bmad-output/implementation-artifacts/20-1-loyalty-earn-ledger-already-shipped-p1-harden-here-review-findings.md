# Review findings — P2-E05-S01 (loyalty earn ledger — harden)

Sweep review 2026-06-03. Commit `789c9d41` (epic). Earn primitive sound: append-only (immutable
trigger), integer points (`assertPositivePoints` + CHECK>0), sequential idempotency, rate snapshot
(AC3), balance derived. No code change (findings are wiring decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] AC1 not wired** — `earnPointsV2` has ZERO production callers; the wallet route
  still returns hardcoded `loyaltyPoints: 0`, so no earn row is written on a settled payment. Decide
  if settled-payment→earn wiring is in this "harden" story's scope.
- **[Decision][MED] Concurrent same-key earn throws a 500** (find-by-key then insert, no 23505 catch).
- **[Decision][MED] AC2 wallet_ledger reference is optional/unenforced** for earn rows.

## Dismissed
index column-order cosmetic; nullable idempotency_key after 0087 (multiple NULLs OK); no cross-engine balance contamination.
