-- P1-E09-S01: SMS adapter interface + stub.
-- Additive-only: extend the existing sms_outbox stub log so the canonical
-- send({to, template, data}) interface can persist the template key, the data
-- bag that produced the rendered body, and a queue status. Existing rows keep
-- their values; new columns are nullable / defaulted.
ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sms_outbox ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued';
