-- P3-E01-S05: staff phone for the commission payout export (M-Pesa B2C). Additive.
--
-- The payout CSV (S05 AC1) needs each staff member's phone to feed M-Pesa B2C.
-- Staff are pure data records (no auth), so the phone lives directly on the row.
-- Nullable — a staff member may have no phone on file yet; the export surfaces a
-- blank phone rather than dropping the line.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS phone text;
