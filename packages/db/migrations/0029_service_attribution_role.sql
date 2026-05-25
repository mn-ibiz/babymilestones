-- P1-E07-S02: attribution role per service. Additive-only.
--
-- 7-1 created `services.attribution_role_required` as free text. This story
-- constrains it to a nullable ENUM aligned with the staff-role taxonomy from
-- P1-E07-S03 (stylist | instructor | attendant | coach | event_staff), mirroring
-- ATTRIBUTION_ROLES in @bm/contracts:
--   * NULL                  -> attribution optional (AC3)
--   * one of the five roles -> Reception must pick a staff member of that role (AC2)
--
-- We add the CHECK as a named constraint, guarded so the migration is idempotent
-- (re-runnable) and never duplicates the constraint. The half-open NULL stays
-- valid: a CHECK passes when its expression is NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_attribution_role_required_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_attribution_role_required_check
      CHECK (
        attribution_role_required IS NULL
        OR attribution_role_required IN ('stylist', 'instructor', 'attendant', 'coach', 'event_staff')
      );
  END IF;
END
$$;
