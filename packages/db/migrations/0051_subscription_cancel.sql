-- P2-E02-S06: cancel a subscription at period end. Additive.
--
-- Cancellation is scheduled, not immediate: `cancel_at_period_end = true` keeps
-- the subscription usable through the paid period, then the renewal cron flips it
-- to 'cancelled' at period end instead of charging the next period (no refund —
-- AC3). It is reversible (clear the flag) any time before that flip (AC2).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
