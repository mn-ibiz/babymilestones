-- X8-S03: daily DB backup + retention. Additive-only.

-- One row per backup attempt (AC3 — records every run + result). The daily
-- backup job inserts a row before invoking the (injected) dump, then stamps
-- the outcome. Off-host storage location + dump size captured for the restore
-- drill (AC4) and the 30-day retention prune (AC2).
CREATE TABLE IF NOT EXISTS backup_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- running | success | failed
  status        text NOT NULL DEFAULT 'running',
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  -- Off-host object key/path of the snapshot (NULL on failure).
  location      text,
  -- Dump size in bytes (NULL until/unless the dump succeeds).
  size_bytes    bigint,
  -- Populated on failure with the error message.
  error         text,
  -- Stamped when a retention prune removes this run's snapshot (AC2).
  pruned_at     timestamptz
);

-- Retention prune scans by age; the daily job lists recent runs by start time.
CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx ON backup_runs (started_at);
CREATE INDEX IF NOT EXISTS backup_runs_status_idx     ON backup_runs (status);
