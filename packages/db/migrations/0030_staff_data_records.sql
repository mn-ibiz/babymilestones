-- P1-E07-S03: staff data records (no logins). Additive-only.
--
-- `staff` are pure DATA records — the stylists, instructors, attendants, coaches
-- and event staff that bookings get attributed to (and, in P3, accrue commission
-- to). They are DISTINCT from `users`: they do NOT authenticate, hold no PIN, and
-- have NO FK or association to auth. Deliberately no `user_id` column.
--
-- `role` is CHECK-constrained to the SAME taxonomy as `services.attribution_role_required`
-- (P1-E07-S02 / migration 0029) so a service that requires e.g. `stylist` can only
-- be attributed to a `staff` row of role `stylist`.
--
-- Soft retirement only: `active=false` + a `terminated_at` timestamp. There are
-- NO hard deletes — booking attribution history must keep referencing the row.
-- Commission rate is explicitly OUT of scope here (handled in P3-E01); role only.
--
-- Renames do not mutate history: bookings carry a denormalised name-at-time-of-
-- booking snapshot (Reception story S04), so changing `display_name` here never
-- retroactively rewrites past attributions.
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  terminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_role_check
    CHECK (role IN ('stylist', 'instructor', 'attendant', 'coach', 'event_staff'))
);

-- List/filter by role + active is the common Reception/admin query.
CREATE INDEX IF NOT EXISTS staff_role_active_idx ON staff (role, active);
