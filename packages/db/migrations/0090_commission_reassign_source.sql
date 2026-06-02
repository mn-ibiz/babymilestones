-- P3-E03-S04 (Story 25.4): Reassign a salon booking between stylists.
-- Additive-only. When a SETTLED salon booking is reassigned to a different
-- stylist (rare — AC4), the commission already accrued to the OLD stylist must
-- move to the NEW stylist. We honour the append-only ledger (P3-E01 AC4): the
-- old stylist's accrual is REVERSED with a signed-opposite `refund_reversal`
-- row, then the new stylist's commission is POSTED as a fresh positive line.
--
-- That fresh line cannot reuse `source = 'booking'` — the partial unique index
-- `commission_ledger_one_accrual_per_booking` (migration 0060) permits exactly
-- ONE 'booking' accrual per booking, and the original is preserved (it is the
-- target of the reversal). So we introduce a third, distinct source value
-- `'reassign'` for the moved commission line. It is OUTSIDE the partial unique
-- index (which only covers `source = 'booking'`), so the move never collides;
-- and it is invisible to `recordBookingCommission` / `reverseBookingCommission`
-- (both key on `source = 'booking'`), so accrual + refund semantics are
-- unchanged.
--
-- This only widens the CHECK constraint — no data is rewritten.

ALTER TABLE commission_ledger DROP CONSTRAINT IF EXISTS commission_ledger_source_check;
ALTER TABLE commission_ledger
  ADD CONSTRAINT commission_ledger_source_check
  CHECK (source IN ('booking', 'refund_reversal', 'reassign'));
