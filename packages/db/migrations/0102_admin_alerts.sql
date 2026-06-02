-- P6-E04-S03 (Story 34.3): Negative-feedback alert. When a parent submits a LOW
-- rating (≤2), an alert worker raises an IN-APP alert for admins + texts the
-- configured ops/admin number, within the 5-minute SLA. Additive-only.
--
-- Two pieces:
--
--   1. `admin_alerts` — a minimal in-app alert surface (the bell / alerts list).
--      One row per raised alert: a typed, severity-tagged heads-up that links to
--      a detail view (`link_path`). Unread until an admin marks it read/dismissed.
--      Generic enough to carry future alert types, but the only producer today is
--      the negative-feedback cron (`type = 'negative_feedback'`).
--
--   2. `feedback.alerted_at` — the idempotency stamp. The cron scans submitted
--      ≤2 feedback whose `alerted_at IS NULL`, raises ONE alert + ONE SMS, then
--      stamps `alerted_at`. A re-run skips already-stamped rows, so a feedback row
--      alerts exactly once. The `admin_alerts` UNIQUE (type, source_type,
--      source_id) is a second guard (a replay can never insert a duplicate alert).

CREATE TABLE IF NOT EXISTS admin_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The alert kind (e.g. 'negative_feedback'). Extensible plain text.
  type        text NOT NULL,
  -- Severity bucket for ordering / styling: 'info' | 'warning' | 'critical'.
  severity    text NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('info', 'warning', 'critical')),
  -- What the alert is ABOUT (the source row): kind + id. For a negative-feedback
  -- alert this is ('feedback', <feedback id>) — the (type, source_*) UNIQUE below
  -- guarantees one alert per source touchpoint (idempotency).
  source_type text NOT NULL,
  source_id   text NOT NULL,
  -- Short human title + body for the in-app list. NEVER carries the parent's
  -- comment text (a low rating's free text is sensitive — ids/labels only).
  title       text NOT NULL,
  body        text,
  -- The in-app path the alert links to (the feedback detail view, AC2).
  link_path   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- NULL = unread. Stamped when an admin opens / acknowledges the alert.
  read_at     timestamptz,
  -- NULL = active. Stamped when an admin dismisses the alert from the list.
  dismissed_at timestamptz,
  -- Idempotency: at most ONE alert per (type, source touchpoint). A replayed raise
  -- (e.g. a cron re-run that races the `alerted_at` stamp) hits this and is a no-op.
  CONSTRAINT admin_alerts_source_uniq UNIQUE (type, source_type, source_id)
);

-- The unread-alerts list (the bell): scan active, unread alerts newest-first.
CREATE INDEX IF NOT EXISTS admin_alerts_unread_idx
  ON admin_alerts (created_at) WHERE read_at IS NULL AND dismissed_at IS NULL;

-- The negative-feedback cron's idempotency stamp (P6-E04-S03 AC1). NULL until the
-- worker has raised the alert + SMS for this feedback row; a re-run skips stamped
-- rows so a feedback alerts exactly once.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

-- The cron's scan: submitted, low-rated feedback not yet alerted. Partial on the
-- not-yet-alerted set so the worker's left-anti-join stays cheap.
CREATE INDEX IF NOT EXISTS feedback_unalerted_idx
  ON feedback (submitted_at) WHERE alerted_at IS NULL AND rating IS NOT NULL;
