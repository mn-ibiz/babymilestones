-- P2-E02-S04: subscription pause/resume. Additive.
--
-- Pausing freezes a subscription (`status='paused'`): entitlement is untouched
-- and the booking flow no longer matches it (it only matches active subs), so
-- bookings fall back to wallet pay-as-you-go. Resuming shifts the period dates
-- forward by the pause duration so the parent doesn't lose paid-for time.
-- `paused_at` anchors the current pause; `pause_history` keeps the closed
-- intervals for audit/reporting.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pause_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Widen the one-per-(child,plan) fence to cover PAUSED subs too: a paused sub
-- still occupies the slot, so re-subscribing (which would double-charge) must be
-- blocked until it's cancelled. The 0047 index only fenced 'active'.
DROP INDEX IF EXISTS subscriptions_child_plan_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_child_plan_live_uniq
  ON subscriptions (child_id, plan_id)
  WHERE status <> 'cancelled';
