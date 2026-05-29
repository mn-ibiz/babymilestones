-- P2-E01-S02: optional age-eligibility range (in months) per service. Additive.
--
-- A service may restrict which children can book it by age (e.g. a baby class
-- for 0–12 months). Both bounds are nullable: NULL min = no lower bound, NULL
-- max = no upper bound, both NULL = open to all ages (the existing default).
-- Age is measured in MONTHS to match the `ageInMonths` helper + the baby-care
-- domain. The booking-browse flow (P2-E01-S02 AC2) filters slots to children
-- whose age falls within [age_min_months, age_max_months].

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS age_min_months integer CHECK (age_min_months >= 0);
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS age_max_months integer CHECK (age_max_months >= 0);

-- A min above the max is never a valid range. Guarded so re-running the whole
-- migration set on every deploy (migrate.ts has no applied-tracking table) does
-- not error with "constraint already exists" — matches the 0029/0031 convention.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_age_range_ck') THEN
    ALTER TABLE services
      ADD CONSTRAINT services_age_range_ck
      CHECK (age_min_months IS NULL OR age_max_months IS NULL OR age_min_months <= age_max_months);
  END IF;
END $$;
