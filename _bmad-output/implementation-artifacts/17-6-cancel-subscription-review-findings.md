# Review findings — P2-E02-S06 (cancel subscription)

Sweep review 2026-06-03. Commit `839caaff`. Core sound: cancel-at-period-end only sets the flag,
period plays out, cron terminates with no charge/refund (AC3), reversal works, row-locked. Parent
`/cancel` + `/uncancel` properly authz'd (`requireParent` + `ownedSubscription`) — no IDOR there.

## Patched this review (via the S04 fix)
- The reception subscription pause/resume + booking-cancel IDOR this story re-flagged was fixed under
  P2-E02-S04 (added `isStaffRole` gate to both routes in `reception/booking.ts`).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Renewal cron writes a spurious `subscription.cancelled` audit when a concurrent
  un-cancel wins the race** (flag-conditional UPDATE matched 0 rows but audit fires anyway). Use
  `.returning()` and gate the audit on a returned row. `subscription-renew.ts:146`.
- **[Decision][LOW] Re-`/cancel` of an already-flagged sub is non-idempotent** (duplicate
  `cancel_requested` audit). Early-return when the flag is already set. `subscriptions.ts:318`.

## Dismissed
Paused-sub immediate cancel (intentional zombie-avoidance, tested); non-tx UPDATE+audit (pre-existing style, not money).
