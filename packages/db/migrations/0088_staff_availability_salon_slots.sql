-- P3-E03-S01 (Story 25.1): Kids-Only Salon Flow — stylist availability + salon
-- slot creation. Additive-only. Re-uses the P2-E01 slot mechanics, scoped to the
-- salon unit.
--
-- Three additive changes:
--
-- 1. `services.salon_duration_minutes` — a salon service's appointment length in
--    minutes. Nullable: only `unit = 'salon'` services carry one. The nightly
--    salon slot generator chops a stylist's availability window into back-to-back
--    slots of this length (a partial trailing window is dropped, mirroring the
--    P2-E01 `slot_duration_minutes` window math). NULL = the service is not
--    bookable as discrete salon slots yet.
--
-- 2. `staff_availability` (AC1) — a recurring WEEKLY rule: "stylist `staff_id` is
--    in on `day_of_week` (0=Sun..6=Sat), between `start_time` and `end_time`,
--    during the calendar range [effective_from, effective_to]." The effective
--    date range bounds WHEN the weekly rule applies (inclusive both ends; NULL
--    `effective_to` = open/ongoing). This is the TEMPLATE — not bookable directly.
--
-- 3. `salon_slots` (AC2) — the concrete, bookable MATERIALISATION: one row per
--    (stylist availability × salon service × date × window) for a rolling future
--    horizon, regenerated nightly. A slot is keyed to its generating availability
--    + service so regeneration is idempotent and edits affect only FUTURE,
--    not-yet-booked slots (AC3). Already-booked / past slots are never mutated or
--    deleted — `bookings.salon_slot_id` records the consumption and is protected
--    on regeneration, exactly as `slot_id` protects `session_slots`.

-- 1) Salon service duration (minutes). Additive, nullable, positive when set.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS salon_duration_minutes integer
  CHECK (salon_duration_minutes IS NULL OR salon_duration_minutes > 0);

-- 2) Stylist weekly availability (AC1).
CREATE TABLE IF NOT EXISTS staff_availability (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL REFERENCES staff(id),
  -- 0 = Sunday .. 6 = Saturday (JS getDay() convention; matches service_schedules).
  day_of_week        integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- Wall-clock window, HH:MM 24h strings; end strictly after start.
  start_time         text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time           text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Calendar range during which the weekly rule applies. Inclusive lower bound;
  -- `effective_to` NULL = open/ongoing, else inclusive upper bound.
  effective_from     date NOT NULL,
  effective_to       date,
  -- Soft on/off — a retired availability keeps the slots it already generated.
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  -- A closed/inverted effective range is never valid.
  CHECK (effective_to IS NULL OR effective_from <= effective_to)
);

-- Per-stylist availability scan (admin list + nightly generation).
CREATE INDEX IF NOT EXISTS staff_availability_staff_id_idx
  ON staff_availability (staff_id);

-- Active-only generation scan by weekday.
CREATE INDEX IF NOT EXISTS staff_availability_active_dow_idx
  ON staff_availability (is_active, day_of_week);

-- 3) Concrete salon slots (AC2).
CREATE TABLE IF NOT EXISTS salon_slots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL REFERENCES staff(id),
  service_id         uuid NOT NULL REFERENCES services(id),
  -- The availability rule that generated this slot. Never hard-deleted (rules are
  -- soft-retired), so a plain reference is enough.
  availability_id    uuid REFERENCES staff_availability(id),
  -- Calendar date the slot falls on.
  slot_date          date NOT NULL,
  -- Wall-clock window for this concrete slot (HH:MM 24h), within the availability.
  start_time         text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time           text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Duration SNAPSHOT (minutes) from the service at generation time, so a later
  -- service-duration edit only changes FUTURE regenerated slots (AC3).
  duration_minutes   integer NOT NULL CHECK (duration_minutes > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

-- One slot per (availability, service, date, start_time): makes nightly
-- regeneration idempotent (re-running never duplicates — upsert on conflict).
CREATE UNIQUE INDEX IF NOT EXISTS salon_slots_avail_service_date_start_uniq
  ON salon_slots (availability_id, service_id, slot_date, start_time);

-- Browse lookup by stylist + date window (and by service + date).
CREATE INDEX IF NOT EXISTS salon_slots_staff_id_slot_date_idx
  ON salon_slots (staff_id, slot_date);
CREATE INDEX IF NOT EXISTS salon_slots_service_id_slot_date_idx
  ON salon_slots (service_id, slot_date);

-- Link a booking to the salon slot it consumes. Additive, nullable + no backfill:
-- existing bookings carry NULL. A salon slot referenced by a booking is protected
-- from deletion on regeneration (AC3 — historical bookings are never disturbed).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_slot_id uuid REFERENCES salon_slots(id);

CREATE INDEX IF NOT EXISTS bookings_salon_slot_id_idx
  ON bookings (salon_slot_id);
