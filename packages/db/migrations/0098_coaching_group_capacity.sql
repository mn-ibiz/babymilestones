-- P5-E01-S03 (Story 31.3): Group session booking. Additive-only.
--
-- A GROUP coaching session is a coaching slot with capacity > 1; a 1:1 offering
-- stays capacity 1 (AC1). Parents book INDIVIDUAL seats and the browse shows SEATS
-- REMAINING (AC2). This mirrors the general booking engine's capacity model
-- (service_schedules.capacity → session_slots.capacity, migration for P2-E01):
-- the capacity SOURCE lives on the offering, and the bookable slot carries a
-- SNAPSHOT taken at generation time, so a later capacity edit only changes FUTURE
-- regenerated slots.
--
-- Two additive columns:
--
-- 1. `services.coaching_capacity` — seats per generated slot for a coaching
--    offering. Nullable (only coaching offerings carry one; NULL = unset, treated
--    as 1 = a 1:1 hold). CHECK-constrained to >= 1. one_to_one → 1; group → N (> 1).
--
-- 2. `coaching_slots.capacity` — seats SNAPSHOT taken from the offering's
--    `coaching_capacity` at generation time. NOT NULL, defaults to 1 so existing
--    (capacity-1) slots and the idempotent regenerator keep their single-seat
--    behaviour. `seats_remaining` is NOT stored: it is `capacity − (non-cancelled
--    bookings in the slot)`, computed at read time (mirrors session_slots).

-- 1) Group capacity source on the coaching offering. Additive, nullable, CHECK >= 1.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coaching_capacity integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_coaching_capacity_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_coaching_capacity_check
      CHECK (coaching_capacity IS NULL OR coaching_capacity >= 1);
  END IF;
END
$$;

-- 2) Seats SNAPSHOT on the concrete slot. NOT NULL, defaults to 1 (capacity-1
-- hold) so existing rows + the idempotent regenerator are unaffected. CHECK >= 1.
ALTER TABLE coaching_slots
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coaching_slots_capacity_check'
  ) THEN
    ALTER TABLE coaching_slots
      ADD CONSTRAINT coaching_slots_capacity_check
      CHECK (capacity >= 1);
  END IF;
END
$$;
