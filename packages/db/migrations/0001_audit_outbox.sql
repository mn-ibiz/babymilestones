-- X5-S01: audit_outbox (outbox-pattern audit). Additive-only.
CREATE TABLE IF NOT EXISTS audit_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action        text NOT NULL,
  target_table  text,
  target_id     text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

-- Drain worker (X5-S02) scans unprocessed rows oldest-first.
CREATE INDEX IF NOT EXISTS audit_outbox_unprocessed_idx
  ON audit_outbox (created_at)
  WHERE processed_at IS NULL;
