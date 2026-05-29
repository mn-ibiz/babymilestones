-- P2-E03-S03: pickup hand-off with free-text observations. Additive-only.
--
-- At hand-off the attendant records the child's day: a `mood` (one of 5 emoji),
-- a set of `activities` (a configurable chip list), and a single optional
-- free-text `note`. One observation per hand-off, linked to the booking + its
-- attendance. The `child_id` / `parent_id` are denormalised onto the row so the
-- 24-month anonymisation job (S05) can strip them in place without walking the
-- booking graph; `note` is the free-text it later scrubs of names. `anonymised_at`
-- marks a row whose PII has been cleared (NULL = still identifiable).
--
-- `attendant_name_snapshot` is captured at hand-off so the parent's feed (S04)
-- shows who logged the note even if the staff record later changes.
CREATE TABLE IF NOT EXISTS observations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The booked visit this observation is for (FK). Retained through anonymisation.
  booking_id               uuid NOT NULL REFERENCES bookings(id),
  -- The attendance (check-in/out) row this hand-off closed (FK). Nullable.
  attendance_id            uuid REFERENCES attendances(id),
  -- Denormalised owner ids — NULLed by the S05 anonymisation job after 24 months.
  child_id                 uuid REFERENCES children(id),
  parent_id                uuid REFERENCES parents(id),
  -- Mood emoji (one of the fixed 5-emoji picker; default 😊). Required.
  mood                     text NOT NULL,
  -- Selected activity chips, a JSON array of strings (configurable list, AC1).
  activities               jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Single optional free-text line (AC1). The S05 job scrubs names from this.
  note                     text,
  -- Acting attendant user id (attribution). Nullable.
  attendant_id             uuid,
  -- Attendant display name snapshot, shown in the parent feed (S04).
  attendant_name_snapshot  text NOT NULL,
  -- Set by the S05 anonymisation job once PII has been cleared (NULL until then).
  anonymised_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Per-child feed scan, newest first (S04).
CREATE INDEX IF NOT EXISTS observations_child_id_created_at_idx
  ON observations (child_id, created_at);

-- One observation per booking hand-off (a booking is handed over once).
CREATE UNIQUE INDEX IF NOT EXISTS observations_booking_id_uniq
  ON observations (booking_id);

-- Retention scan by age (S05 walks oldest-first).
CREATE INDEX IF NOT EXISTS observations_created_at_idx
  ON observations (created_at);
