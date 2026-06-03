# Review findings — P3-E03-S04 (reassign a salon booking between stylists)

Sweep review 2026-06-03. Commit `1737207e` (the prior reassign-atomicity fix). **Mostly sound:**
attribution + commission move wrapped in ONE tx (savepoints roll up); append-only (reversal/reassign
rows sit outside the `source='booking'` unique index, no collision); A→B→A / A→B→C / no-op all net
correctly; capacity lock-then-check on the target slot. 133 wallet tests pass. No code change — the one
defect is a subtle commission-idempotency change (a wrong fix double-pays), so collected with the exact fix.

## Decision needed (see DECISIONS-NEEDED.md — HIGH, money)
- **[Decision][BLOCKER → money] Re-reassign back to a zero-net stylist silently loses commission.**
  Empirically reproduced (two reviewers): `reassignBookingCommission` infers "already settled on the
  current stylist" purely from `priorHolders.length===0` (no OTHER staff holds positive net), without
  verifying the current target is actually whole. A(10%)→B(no rate)→A reverses A to 0, then B→A sees no
  positive holder, returns `replayed:true`, and posts nothing → A (who did the service) earns 0.
  **Recommended fix:** gate the replay no-op on `netByStaff.get(newStaffId) === expectedAmount`
  (resolve the target's rate at `booking.createdAt`; null rate → 0), else post the missing `reassign`
  line. + a regression test A(rated)→B(no rate)→A. (Not auto-applied: a wrong idempotency change risks
  double-posting; confirm 0%-rate stylists are a real config.) `packages/wallet/src/commission-hook.ts:227-240`.

## Dismissed
atomicity (savepoints); authz (`create payment` staff guard); append-only (index partition); capacity lock.
