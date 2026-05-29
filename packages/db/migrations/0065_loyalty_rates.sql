-- P2-E05-S02: configurable, effective-dated loyalty rates.
-- Append-only effective-dated rows: changing a rate INSERTs a NEW row; prior
-- rows are never updated or deleted, so the rates under which historical points
-- were earned/redeemed stay immutable (AC2). `getEffectiveRates(at)` picks the
-- latest row with effective_from <= at per rate_type.
--   rate_type 'earn'   = KES of qualifying spend per 1 point (default 100)
--   rate_type 'redeem' = KES value of 1 point at redemption (default 1)
CREATE TABLE IF NOT EXISTS loyalty_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type text NOT NULL CHECK (rate_type IN ('earn', 'redeem')),
  value integer NOT NULL CHECK (value > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS loyalty_rates_type_effective_idx
  ON loyalty_rates (rate_type, effective_from DESC);

-- Seed defaults effective at the epoch so getEffectiveRates always resolves
-- even before an admin first tunes a rate (AC1 defaults: earn 100, redeem 1).
-- Two single-statement INSERTs (a multi-row VALUES tripped the test SQL
-- runner's simple-query splitting, silently dropping the second row).
INSERT INTO loyalty_rates (id, rate_type, value, effective_from, created_by)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'earn', 100, '1970-01-01T00:00:00Z', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loyalty_rates (id, rate_type, value, effective_from, created_by)
VALUES ('00000000-0000-0000-0000-0000000000d1', 'redeem', 1, '1970-01-01T00:00:00Z', NULL)
ON CONFLICT (id) DO NOTHING;
