-- P2-E02-S05: subscription renewal / dunning. Additive.
--
-- When a period ends the renewal job charges the next period from the wallet.
-- On failure (insufficient + auto-credit off) the subscription enters 'dunning'
-- and is retried daily; after the grace window it is paused until manually
-- resumed. `dunning_since` anchors the grace window.

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'paused', 'cancelled', 'dunning'));

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dunning_since timestamptz;
