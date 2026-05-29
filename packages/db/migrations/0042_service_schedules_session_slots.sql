-- P2-E01-S01: time-slot model + capacity for services. Additive-only.
--
-- Two tables underpin the booking engine (P2-E01):
--
-- `service_schedules` (AC1) — a recurring weekly availability rule for a service:
--   "on day_of_week, between start_time and end_time, offer slots of
--   slot_duration_minutes each, each holding `capacity` children." A schedule is
--   the template; it is NOT bookable directly. Admin CRUD lives over this table
--   (AC4) and every change is audited (AC5). `is_active = false` retires a rule
--   without deleting it (history + the slots it already generated survive).
--
-- `session_slots` (AC2) — the concrete, bookable materialisation. A nightly job
--   (P2-E01 cron) expands every active schedule into one row per (date × window)
--   for the next 60 days. Slots carry a `capacity` SNAPSHOT taken from the
--   schedule at generation time, so a later schedule edit (AC4) only changes
--   FUTURE regenerated slots — already-generated/booked slots keep their snapshot.
--   `remaining_capacity` is NOT stored: it is computed as
--   `capacity − (count of bookings in the slot)` at read time (AC3).

CREATE TABLE IF NOT EXISTS service_schedules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            uuid NOT NULL REFERENCES services(id),
  -- 0 = Sunday .. 6 = Saturday (JS getDay() convention).
  day_of_week           integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- Wall-clock window, stored as HH:MM 24h strings; end must be after start.
  start_time            text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time              text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Each slot's length in minutes; must be positive and divide the window evenly
  -- (enforced in app logic — a partial trailing window is dropped).
  slot_duration_minutes integer NOT NULL CHECK (slot_duration_minutes > 0),
  -- Children per slot. Non-negative (0 = temporarily closed but kept on the rule).
  capacity              integer NOT NULL CHECK (capacity >= 0),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- A closed window is never valid (start strictly before end).
  CHECK (start_time < end_time)
);

-- Per-service schedule scan (admin list + nightly generation).
CREATE INDEX IF NOT EXISTS service_schedules_service_id_idx
  ON service_schedules (service_id);

CREATE TABLE IF NOT EXISTS session_slots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id         uuid NOT NULL REFERENCES services(id),
  -- The schedule that generated this slot. ON DELETE is never used (schedules are
  -- soft-retired), so a plain reference is enough; kept nullable for ad-hoc slots.
  schedule_id        uuid REFERENCES service_schedules(id),
  -- Calendar date the slot falls on.
  slot_date          date NOT NULL,
  -- Wall-clock window for this concrete slot (HH:MM 24h), within the schedule.
  start_time         text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time           text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Capacity SNAPSHOT from the schedule at generation time (AC4 — edits to the
  -- schedule do not retroactively rewrite this row's capacity).
  capacity           integer NOT NULL CHECK (capacity >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

-- One slot per (schedule, date, start_time): makes nightly regeneration
-- idempotent (re-running the job does not duplicate slots — upsert on conflict).
CREATE UNIQUE INDEX IF NOT EXISTS session_slots_schedule_date_start_uniq
  ON session_slots (schedule_id, slot_date, start_time);

-- Booking lookup by service + date window (the booking engine reads slots here).
CREATE INDEX IF NOT EXISTS session_slots_service_id_slot_date_idx
  ON session_slots (service_id, slot_date);

-- Link a booking to the slot it consumes (P2-E01 booking flow). Additive,
-- nullable + no backfill: existing P1 bookings (arrivals only) carry NULL.
-- A slot's remaining_capacity counts the bookings whose slot_id matches it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES session_slots(id);

-- Count bookings-in-slot quickly for the remaining_capacity computation (AC3).
CREATE INDEX IF NOT EXISTS bookings_slot_id_idx
  ON bookings (slot_id);
