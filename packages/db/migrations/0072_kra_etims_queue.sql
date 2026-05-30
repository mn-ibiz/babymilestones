-- P5-E02-S02 kra_etims_queue: durable retry / dead-letter queue for eTIMS
-- submissions. When KRA is unreachable the receipt's submission is queued here
-- and the jobs runner retries it with exponential backoff; a row that exhausts
-- max_attempts is dead-lettered (the alert) for manual inspection / requeue.
-- Stores the full receipt payload so a retry re-attempts standalone. The
-- idempotency_key is UNIQUE so a receipt is enqueued at most once.
CREATE TABLE IF NOT EXISTS kra_etims_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  series text NOT NULL,
  sequence_number integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 10,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The retry worker claims due pending rows by (status, next_attempt_at).
CREATE INDEX IF NOT EXISTS kra_etims_queue_due_idx
  ON kra_etims_queue(status, next_attempt_at);
