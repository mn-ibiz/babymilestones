-- P3-E01-S01: per-staff commission rate with effective dating. Additive-only.
--
-- A staff member's commission percentage changes over time. Each rate is a row
-- with a half-open validity interval [effective_from, effective_to): the rate in
-- force for a booking is the row whose `effective_from <= booking.created_at` AND
-- (`effective_to` IS NULL OR `booking.created_at < effective_to`). Setting a new
-- rate auto-closes the previous open one by stamping its `effective_to` to the
-- new rate's `effective_from` (AC2) — done atomically in one transaction so there
-- is never an overlap or a gap. `effective_to` NULL marks the currently-open rate.
--
-- `rate_percent` is a decimal percentage (e.g. 12.50 = 12.5%). The commission
-- amount it produces is always computed in INTEGER cents (no float persisted) so
-- there is no rounding drift in the ledger (see P3-E01-S02).
CREATE TABLE IF NOT EXISTS staff_commission_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The staff member this rate applies to. FK to staff(id).
  staff_id       uuid NOT NULL REFERENCES staff(id),
  -- Commission percentage, decimal (e.g. 12.50 means 12.5%). 0..100 inclusive.
  rate_percent   numeric(5, 2) NOT NULL,
  -- Half-open interval start (inclusive). The rate applies from this instant.
  effective_from timestamptz NOT NULL,
  -- Half-open interval end (exclusive). NULL = currently open / no successor yet.
  effective_to   timestamptz,
  -- Optional human-readable reason for the change (AC1).
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_commission_rates_rate_range CHECK (rate_percent >= 0 AND rate_percent <= 100),
  -- An open interval cannot end on/before it starts.
  CONSTRAINT staff_commission_rates_interval CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Resolve-the-rate-at-a-time lookups are keyed by (staff_id, effective_from).
CREATE INDEX IF NOT EXISTS staff_commission_rates_staff_eff_idx
  ON staff_commission_rates (staff_id, effective_from);

-- At most one OPEN (effective_to IS NULL) rate per staff member — a partial
-- unique index fences a double-open race even under concurrent rate changes.
CREATE UNIQUE INDEX IF NOT EXISTS staff_commission_rates_one_open_per_staff
  ON staff_commission_rates (staff_id)
  WHERE effective_to IS NULL;
