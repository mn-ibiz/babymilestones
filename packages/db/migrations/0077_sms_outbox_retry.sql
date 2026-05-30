-- P3-E06-S04: SMS retry worker support. Additive-only columns on sms_outbox.
--
-- The retry worker picks rows where status='failed' AND attempt_count < 5,
-- re-sends with exponential backoff (1m, 5m, 30m, 2h, 12h via next_attempt_at),
-- and after 5 failed attempts dead-letters the row (status='dead_lettered',
-- dead_lettered_at stamped) and alerts. last_error captures the most recent
-- provider error for forensics; sent_at stamps a successful (re)send.
--
-- Existing rows default to attempt_count=0 and NULL gates, so a row that was
-- already 'failed' becomes immediately eligible on the first worker pass.
ALTER TABLE sms_outbox
  ADD COLUMN IF NOT EXISTS attempt_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at  timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error       text,
  ADD COLUMN IF NOT EXISTS sent_at          timestamptz;

-- The worker scans failed, not-yet-due, not-dead-lettered rows; index the gate.
CREATE INDEX IF NOT EXISTS sms_outbox_retry_idx
  ON sms_outbox (status, next_attempt_at);
