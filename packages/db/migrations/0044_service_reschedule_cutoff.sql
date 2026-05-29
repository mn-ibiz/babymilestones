-- P2-E01-S05: per-service reschedule cut-off (hours before the slot). Additive.
--
-- A parent may move a booking up to `reschedule_cutoff_hours` before the booked
-- slot's start; after that the online reschedule is refused ("contact reception").
-- Default 2 hours. NOT NULL with a default so existing services backfill safely.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS reschedule_cutoff_hours integer NOT NULL DEFAULT 2
  CHECK (reschedule_cutoff_hours >= 0);
