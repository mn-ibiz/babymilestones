-- P3-E01-S02: commission line recorded on every attributed booking. Additive-only.
--
-- `commission_ledger` is an APPEND-ONLY ledger of commission accrued to staff.
-- When an attributed booking settles (wallet debit OR subscription consumption)
-- one row is written: the commission = service price (snapshot) × the staff rate
-- in force at booking time, in INTEGER cents (AC1/AC3). A refund reverses the
-- commission with a NEW signed-opposite reversing row (AC2) — never an update or
-- delete of the original (AC4).
--
-- Idempotency (AC4 / re-run safety): at most ONE original (`source='booking'`)
-- row per booking, enforced by a partial unique index. A reversal row points at
-- the original via `reverses_entry_id`.
CREATE TABLE IF NOT EXISTS commission_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The staff member the commission accrues to. FK to staff(id).
  staff_id          uuid NOT NULL REFERENCES staff(id),
  -- The booking this line is for. FK to bookings(id).
  booking_id        uuid NOT NULL REFERENCES bookings(id),
  -- Signed integer cents: positive for an accrual, negative for a reversal.
  amount_cents      bigint NOT NULL,
  -- The decimal rate percentage in force at booking time (snapshot, e.g. 12.50).
  rate_snapshot     numeric(5, 2) NOT NULL,
  -- What produced this line: 'booking' (accrual) | 'refund_reversal' (AC1/AC2).
  source            text NOT NULL CHECK (source IN ('booking', 'refund_reversal')),
  -- For a reversal: the original commission_ledger row it reverses. Null otherwise.
  reverses_entry_id uuid REFERENCES commission_ledger(id),
  -- When the booking settled / was reversed (for period attribution in runs).
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Period + per-staff aggregation for the monthly/ad-hoc runs (P3-E01-S03/S04).
CREATE INDEX IF NOT EXISTS commission_ledger_staff_occurred_idx
  ON commission_ledger (staff_id, occurred_at);

-- One ACCRUAL per booking — a second settle (re-run / replay) is a no-op via the
-- conflict on this partial unique index. Reversals are not constrained here.
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_one_accrual_per_booking
  ON commission_ledger (booking_id)
  WHERE source = 'booking';

-- Lookups of a reversal by the original it reverses.
CREATE INDEX IF NOT EXISTS commission_ledger_reverses_idx
  ON commission_ledger (reverses_entry_id);
