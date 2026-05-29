-- P5-E03 (SMS Go-Live): record live-provider dispatch outcome + cost on the
-- existing sms_outbox. Additive columns only — the stub path leaves them null.
--   provider           : which adapter dispatched ("stub" | "live")
--   provider_message_id : the provider's message id from a successful send (AC3)
--   cost_cents          : per-message cost in minor units, for spend caps (33.3)
--   error              : provider error text on a failed send (no silent loss)
--   dispatched_at       : when a live dispatch completed (sent or failed)
--   deferred_until      : when a capped message becomes eligible again (33.3)
ALTER TABLE sms_outbox
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS cost_cents integer,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz;

-- Spend caps are accounted by (status, dispatched_at) so the day-window scan is
-- index-served rather than a full table scan.
CREATE INDEX IF NOT EXISTS sms_outbox_dispatched_at_idx
  ON sms_outbox (dispatched_at);
CREATE INDEX IF NOT EXISTS sms_outbox_deferred_until_idx
  ON sms_outbox (deferred_until);
