-- P2-E03-S02: attendant check-in. Additive-only.
--
-- An `attendance` is the real arrival/hand-off lifecycle of a booked slot. It is
-- DISTINCT from `bookings.checked_in_at`, which the P1 walk-in flow stamps at
-- booking time (DEFAULT now()) — a P2 slot booking is created in advance and is
-- NOT attended until the attendant checks the child in. One attendance row per
-- booking (UNIQUE) fences a double check-in.
--
-- Check-in (S02) records `checked_in_at` + an optional `dropped_off_at` (the
-- drop-off time field, AC2) and triggers the P1-E03-S05 wallet debit against the
-- booking's pending invoice. Check-out (`checked_out_at`) + the observation row
-- are written by the hand-off flow (S03); those columns are nullable here.
CREATE TABLE IF NOT EXISTS attendances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The booked slot this attendance belongs to (1:1). FK to bookings(id).
  booking_id       uuid NOT NULL REFERENCES bookings(id),
  -- When the attendant checked the child in (AC3). Always set on insert.
  checked_in_at    timestamptz NOT NULL DEFAULT now(),
  -- Optional free-form drop-off time captured at check-in (AC2). Nullable.
  dropped_off_at   timestamptz,
  -- Acting staff user id who performed the check-in (attribution).
  checked_in_by    uuid,
  -- Hand-off (S03): when the child was collected. Nullable until checked out.
  checked_out_at   timestamptz,
  -- Acting staff user id who performed the hand-off (S03). Nullable.
  checked_out_by   uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One attendance per booking — a second check-in for the same booking violates
-- this index (a clear 23505 conflict the route surfaces as 409 "already checked in").
CREATE UNIQUE INDEX IF NOT EXISTS attendances_booking_id_uniq
  ON attendances (booking_id);
