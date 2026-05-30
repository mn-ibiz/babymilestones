-- 0075 (P5-E03-S03): durable rolling-window accounting ledger for the live SMS
-- path. Additive only. One row per DISPATCHED message records when it went out,
-- its recipient, and its actual cost (minor units). The rate/cost limiter sums a
-- rolling/daily window from this table so the per-window total cap, the
-- per-recipient daily cap, and the cost ceiling survive process restarts and
-- multiple sender instances (in-memory counters would not). The stub path never
-- writes here. Indexed on sent_at (window scans) and (recipient, sent_at)
-- (per-recipient scans).
CREATE TABLE IF NOT EXISTS sms_send_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid,
  recipient text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_send_ledger_sent_at_idx ON sms_send_ledger (sent_at);
CREATE INDEX IF NOT EXISTS sms_send_ledger_recipient_sent_at_idx ON sms_send_ledger (recipient, sent_at);
