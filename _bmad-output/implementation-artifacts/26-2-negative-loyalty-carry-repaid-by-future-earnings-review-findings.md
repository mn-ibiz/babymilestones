# Review findings — P3-E04-S02 (negative-loyalty carry repaid by future earnings)

Sweep review 2026-06-03. Epic-level commit. Carry arithmetic (`splitEarnAgainstCarry`) is correct
integer math, 16 tests pass. No code change — the defects are structural (see consolidated decision).

## Decision needed (see DECISIONS-NEEDED.md — consolidated P3-E04)
- **[Decision][BLOCKER · money] Negative carry is invisible to the live redeem path.** The carry lives
  in the P3 column space (`parentId`/`points_delta`), but the only live redeem path sums the disjoint
  P2 space (`walletId`/`direction`). A parent with P2 earn rows can redeem the full P2 balance while a
  carry (from an admin debit-beyond-balance or a clawback) sits untouched → they escape the carry,
  exactly as feared. Part of the loyalty dual-schema unification.
- **[Decision][HIGH] `earnPoints` (the S02 feature) has no production caller** → the earn→repay-carry
  behavior is dead code; a carry, once created, is never repaid.
- **[Decision][HIGH] When wired, `earnPoints`/`adjust`/`clawback` need a tx + row lock** (they read
  balance then insert unlocked → concurrent earns double-count the `applied_to_negative_carry` tag).

## Dismissed
additive migrations + append-only trigger intact; carry arithmetic verified.
