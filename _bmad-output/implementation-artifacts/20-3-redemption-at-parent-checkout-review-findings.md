# Review findings — P2-E05-S03 (redemption at parent checkout)

Sweep review 2026-06-03. Commit `789c9d41` (epic). IDOR clean (walletId session-derived); integer
money math (AC2); per-tx atomic (AC4). **Fixed a money BLOCKER + a replay-500.**

## Patched this review
- **[Patch][BLOCKER · money] Double-spend race.** `redeemPoints` read the loyalty balance via an
  unlocked `SUM` aggregate under READ COMMITTED — two concurrent redeems (different keys) both passed
  the ceiling check and both inserted → negative loyalty balance + over-credited wallet. Took a
  `SELECT … FOR UPDATE` on the wallet row at the START of the transaction (mirrors `debit.ts`).
- **[Patch][HIGH] Same-key replay 500.** With the lock at the top, the loser blocks, then the replay
  SELECT sees the committed row and returns the idempotent result instead of hitting the
  `idempotency_key` UNIQUE violation (previously uncaught → 500). wallet(54 loyalty) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] AC3 "cannot redeem points on a pending settlement" not enforced** — `redeemPoints`
  checks `getLoyaltyBalance` (P2 `walletId` schema) but the pending-clawback hold lives in the P3-E04
  `parentId` schema and is never consulted. No live loss until P3 clawbacks ship, but it becomes a
  money hole then. Reconcile the dual schema (subtract pending before the ceiling check).

## Dismissed
valid kind=adjustment/credit vs CHECK; integer kesForPoints.
