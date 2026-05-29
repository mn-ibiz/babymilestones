-- P3-E06-S01: Job framework observability — the job_runs ledger. Additive-only.
--
-- One row per execution of a registered background job (cron tick OR an admin
-- "run now"). The framework stamps started_at before invoking the handler and
-- ended_at + status on completion, recording the error message on failure. This
-- is the single audit-able record of what ran, when, and whether it succeeded
-- (AC2). Reads power the admin observability surface; the framework writes it.
--
-- `trigger` distinguishes a scheduled tick from a manual admin invocation so an
-- operator can see who/what kicked a run. `triggered_by` is the acting user id
-- for a manual run (NULL for the scheduler). Times are timestamptz (UTC).
CREATE TABLE IF NOT EXISTS job_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text NOT NULL,
  -- 'running' while in flight, then 'success' | 'failed' on completion.
  status       text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'failed')),
  -- 'schedule' (cron tick) | 'manual' (admin run-now, AC4).
  trigger      text NOT NULL DEFAULT 'schedule'
                 CHECK (trigger IN ('schedule', 'manual')),
  -- Acting user for a manual run; NULL for the scheduler.
  triggered_by uuid,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  -- Error message on a failed run (NULL on success / while running).
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Observability surface lists recent runs for a job, newest-first.
CREATE INDEX IF NOT EXISTS job_runs_job_name_started_at_idx
  ON job_runs (job_name, started_at DESC);
-- Dashboard "latest across all jobs" scan.
CREATE INDEX IF NOT EXISTS job_runs_started_at_idx
  ON job_runs (started_at DESC);
