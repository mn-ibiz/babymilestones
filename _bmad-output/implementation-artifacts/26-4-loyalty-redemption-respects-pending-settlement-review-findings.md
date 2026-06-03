# Review findings — P3-E04-S04 (loyalty redemption respects pending settlement)

Sweep review 2026-06-03. Epic-level commit. `markPendingClawback` provisioning (AC2) is built &
tested. **BLOCKER: the guard is never wired into the real redeem path.** No code change — the fix is an
architecture decision (see consolidated P3-E04 decision).

## Decision needed (see DECISIONS-NEEDED.md — consolidated P3-E04)
- **[Decision][BLOCKER · money] AC1 violated — redeem does NOT respect pending settlement.**
  `availableLoyaltyToRedeem` (the correct math, subtracting `pending_clawback`) is **dead code** — the
  live `POST /parents/me/loyalty/redeem` → `redeemPoints` still gates on the raw P2 `walletId` balance
  and never reads `pending_clawback`. Worse, the two are in disjoint partitions of one table (P2 earn
  rows have `parentId` NULL; P3 pending rows have `walletId` NULL, joined by nothing), so even wiring it
  wouldn't work without unifying the owner key. A parent can redeem points about to be clawed back. The
  story file falsely claims `redeemPoints` enforces the guard.
- **[Decision][HIGH] AC3 not implemented** — the quote/UI shows the raw balance, not available-to-redeem
  (no `pendingClawback`/`availableToRedeem` field on `LoyaltyRedemptionQuote`).

## Deferred / tracked
- **[Defer] Once wired, the pending read + redeem must share the wallet `FOR UPDATE` lock** (TOCTOU).

## Dismissed
sumPendingClawback negative-netting handled by SQL SUM.
