-- X5-S02: async drain worker → audit_log projection. Additive-only.

-- Drain-worker bookkeeping on the existing outbox (backoff + dead-letter).
ALTER TABLE audit_outbox
  ADD COLUMN IF NOT EXISTS attempt_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

-- Query-optimised projection. PK = source audit_outbox.id so re-projection is a
-- no-op (idempotent/resumable). The audit-log viewer (P1-E10-S03) reads here.
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY,
  actor_user_id uuid,
  action        text NOT NULL,
  target_table  text,
  target_id     text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL,
  projected_at  timestamptz NOT NULL DEFAULT now()
);

-- The four investigator filters: actor, target, action, time.
CREATE INDEX IF NOT EXISTS audit_log_actor_idx      ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_target_idx     ON audit_log (target_table, target_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx     ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);
