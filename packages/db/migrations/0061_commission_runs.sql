-- P3-E01-S03/S04/S05: commission runs + per-staff run lines. Additive-only.
--
-- A `commission_run` closes a period and snapshots each staff member's total
-- commission for it into `commission_run_lines`. Two kinds:
--   - 'monthly'  — the scheduled month-end close (S03), one per calendar month.
--   - 'ad_hoc'   — an admin-triggered run over an arbitrary date range (S04).
--
-- Idempotency (S03 AC4): a monthly run for a given period is unique, so running
-- twice for the same month is a no-op. Membership of a ledger entry in a run is
-- recorded on `commission_ledger.run_id` (added below) so a later monthly run
-- EXCLUDES commission already paid out in an ad-hoc run (S04 AC3) and no entry is
-- ever double-counted across runs.
CREATE TABLE IF NOT EXISTS commission_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'monthly' | 'ad_hoc'.
  kind          text NOT NULL CHECK (kind IN ('monthly', 'ad_hoc')),
  -- Inclusive period start / exclusive period end (half-open) the run covers.
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  -- Grand total commission cents across all lines (sum of line amounts).
  total_cents   bigint NOT NULL DEFAULT 0,
  -- Set when the accountant confirms the external payout was made (S05 AC3).
  paid_out_at   timestamptz,
  -- Acting user who created the run (null for the scheduled job / system).
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_runs_period CHECK (period_end > period_start)
);

-- One MONTHLY run per (period_start, period_end) — a second monthly run for the
-- same month conflicts on this partial unique index → idempotent no-op (S03 AC4).
CREATE UNIQUE INDEX IF NOT EXISTS commission_runs_monthly_period_uniq
  ON commission_runs (period_start, period_end)
  WHERE kind = 'monthly';

-- Per-staff total for a run (one line per staff member with commission > 0).
CREATE TABLE IF NOT EXISTS commission_run_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES commission_runs(id),
  staff_id      uuid NOT NULL REFERENCES staff(id),
  -- Staff display-name snapshot at run time (the CSV needs a name even if the
  -- staff record is later renamed/retired — payout history must not rewrite).
  staff_name_snapshot text NOT NULL,
  -- Net commission cents for this staff member in the run period (accruals minus
  -- reversals). Always > 0 — zero/negative nets are not paid out as a line.
  amount_cents  bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One line per (run, staff).
CREATE UNIQUE INDEX IF NOT EXISTS commission_run_lines_run_staff_uniq
  ON commission_run_lines (run_id, staff_id);

CREATE INDEX IF NOT EXISTS commission_run_lines_run_idx
  ON commission_run_lines (run_id);

-- Membership: the run a ledger entry was settled into. NULL = not yet run.
-- Stamped when a run claims the entry, so it is never counted by a second run
-- (S04 AC3 / S03 AC4). Additive nullable column on the existing ledger.
ALTER TABLE commission_ledger
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES commission_runs(id);

CREATE INDEX IF NOT EXISTS commission_ledger_run_idx
  ON commission_ledger (run_id);
