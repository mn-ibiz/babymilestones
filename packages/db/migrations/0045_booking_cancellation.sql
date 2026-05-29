-- P2-E01-S06: booking cancellation. Additive.
--
-- A cancelled booking frees its slot seat: capacity is computed from bookings
-- whose status is NOT 'cancelled' (the read model excludes cancelled rows), so a
-- cancellation restores availability without deleting history. The booked slot's
-- pending invoice is voided (AC1); after the cut-off a per-service cancellation
-- fee may apply (AC2, zero by default).

-- Booking lifecycle status. Existing P1 arrivals (slot_id NULL) default to
-- 'confirmed' and are never counted against slot capacity anyway.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('confirmed', 'cancelled'));

-- Per-service cancellation fee in integer cents (AC2). Zero by default.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS cancellation_fee_cents bigint NOT NULL DEFAULT 0
  CHECK (cancellation_fee_cents >= 0);

-- Allow an invoice to be VOIDED when its booking is cancelled (AC1). A voided
-- invoice carries amount_due = 0 so it never counts toward a parent's outstanding.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'settled', 'settled_on_credit', 'outstanding', 'void'));
