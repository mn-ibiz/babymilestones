# Review findings — P2-E02-S03 (bookings deduct subscription entitlement first)

Sweep review 2026-06-03. Commit `838b1e83`. **Core deduct path is SOUND** — atomic & race-safe
(`subscriptions … FOR UPDATE` + slot `FOR UPDATE`; READ COMMITTED re-read), half-open period gate,
`CHECK (entitlement_remaining >= 0)` backstop, wallet fallback. AC1–AC3 tested. No code change —
findings are entitlement/finance decisions.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Cancel over-refunds across periods** — `cancelBooking` refunds `+1` with no
  period/cap check; after the renewal cron resets entitlement, cancelling an old-period booking pushes
  the new period above its cap (free unit each period). `schedules.ts:826`.
- **[Decision][HIGH] Cancel under-refunds when paused/dunning** — the refund UPDATE requires
  `status='active'`; if paused/dunning at cancel time the `+1` matches 0 rows and is silently dropped →
  parent loses a paid unit. `schedules.ts:828`.
- **[Decision][HIGH · finance] Subscription bookings record ZERO revenue & ZERO staff commission**
  (`staffRateSnapshot=0`) — feeds 4 dashboards + `commission-hook` (whose docstring says it fires on
  "subscription consumption"). Needs a per-session value to recognise. `schedules.ts:642`.

## Deferred / tracked
- **[Defer] `rescheduleBooking` cross-period double-dip** (already raised in Epic 16 decision #26).

## Dismissed
FOR-UPDATE-locks-all-active-subs (contention only); multi-active-sub choice (cosmetic).
