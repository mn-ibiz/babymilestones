-- P5-E01-S02 (Story 31.2): Coach availability + 1:1 booking. Additive-only.
--
-- Coaching offerings ARE services (unit = 'coaching') with a coach attributed via
-- attribution_role_required = 'coach'. This story REUSES the generic
-- `staff_availability` table (migration 0088) — the recurring weekly TEMPLATE — for
-- coaches exactly as it serves stylists (AC1). The only new structure is the
-- concrete, bookable MATERIALISATION for coaching, mirroring `salon_slots` but with
-- a STRICT capacity of 1: a 1:1 session holds its slot PRIVATELY, so a booked slot
-- is unavailable to everyone else (AC3).
--
-- One new table + one additive booking column:
--
-- 1. `coaching_slots` — one row per (coach availability × coaching offering × date ×
--    window) for a rolling future horizon, regenerated nightly. The availability
--    window is chopped into back-to-back slots of the offering's
--    `coaching_duration_minutes` (AC1). `duration_minutes` is a SNAPSHOT taken at
--    generation time, so a later duration edit only changes FUTURE regenerated
--    slots; already-generated / booked slots keep their snapshot. A slot is keyed to
--    its generating availability + service so regeneration is idempotent and edits
--    affect only FUTURE, not-yet-booked slots (mirrors salon_slots).
--
-- 2. `bookings.coaching_slot_id` — links a booking to the coaching slot it consumes.
--    A coaching slot referenced by a non-cancelled booking holds its single seat
--    (capacity = 1) and is protected from deletion on regeneration — historical
--    bookings are never disturbed. NULL for non-coaching bookings.

-- 1) Concrete coaching slots (AC1/AC3) — capacity-1, mirrors salon_slots.
CREATE TABLE IF NOT EXISTS coaching_slots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL REFERENCES staff(id),
  service_id         uuid NOT NULL REFERENCES services(id),
  -- The availability rule that generated this slot. Never hard-deleted (rules are
  -- soft-retired), so a plain reference is enough; nullable for ad-hoc slots.
  availability_id    uuid REFERENCES staff_availability(id),
  -- Calendar date the slot falls on.
  slot_date          date NOT NULL,
  -- Wall-clock window for this concrete slot (HH:MM 24h), within the availability.
  start_time         text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time           text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Duration SNAPSHOT (minutes) from the offering at generation time, so a later
  -- duration edit only changes FUTURE regenerated slots.
  duration_minutes   integer NOT NULL CHECK (duration_minutes > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

-- One slot per (availability, service, date, start_time): makes nightly
-- regeneration idempotent (re-running never duplicates — upsert on conflict).
CREATE UNIQUE INDEX IF NOT EXISTS coaching_slots_avail_service_date_start_uniq
  ON coaching_slots (availability_id, service_id, slot_date, start_time);

-- Browse lookup by coach + date window (and by service + date).
CREATE INDEX IF NOT EXISTS coaching_slots_staff_id_slot_date_idx
  ON coaching_slots (staff_id, slot_date);
CREATE INDEX IF NOT EXISTS coaching_slots_service_id_slot_date_idx
  ON coaching_slots (service_id, slot_date);

-- 2) Link a booking to the coaching slot it consumes. Additive, nullable + no
-- backfill: existing bookings carry NULL. A coaching slot referenced by a live
-- booking holds its single seat (capacity = 1) and is protected from deletion on
-- regeneration (historical bookings are never disturbed).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coaching_slot_id uuid REFERENCES coaching_slots(id);

CREATE INDEX IF NOT EXISTS bookings_coaching_slot_id_idx
  ON bookings (coaching_slot_id);
