-- P1-E08-S05: receipt void as a reversing entry. Additive-only.
--
-- Voiding a receipt NEVER deletes or mutates the original. Instead it appends a
-- NEW receipt row with kind='void' and reverses_receipt_id pointing at the
-- original, mirroring the wallet ledger reversing-entry pattern (refund 3-6).
-- The void row carries the negated totals/lines of the original so that
-- original.total + void.total = 0 (and likewise per-line / tax).
--
-- Because the void row's money is negative, the non-negative CHECK constraints
-- from migration 0032 (receipts.total/tax_total, receipt_lines.unit_price/
-- line_tax/line_total) are dropped here. The receipt WRITER still validates
-- non-negative input for normal receipts; the void path is the only producer of
-- negative rows and it is guarded in application code.

-- kind: 'normal' (default, all existing rows) | 'void'.
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'normal';
ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_kind_check;
ALTER TABLE receipts
  ADD CONSTRAINT receipts_kind_check CHECK (kind IN ('normal', 'void'));

-- reverses_receipt_id: the original receipt this void reverses (nullable self-FK).
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS reverses_receipt_id uuid REFERENCES receipts(id);

-- A given original may be voided at most once: a partial unique index over the
-- void rows guarantees no two void rows reverse the same original (AC3). Belt to
-- the application-level double-void guard.
CREATE UNIQUE INDEX IF NOT EXISTS receipts_reverses_receipt_id_unique
  ON receipts (reverses_receipt_id)
  WHERE reverses_receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_kind_idx ON receipts (kind);

-- Relax the non-negative money CHECKs so void rows can carry negated amounts.
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_total_check;
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_tax_total_check;
ALTER TABLE receipt_lines DROP CONSTRAINT IF EXISTS receipt_lines_unit_price_check;
ALTER TABLE receipt_lines DROP CONSTRAINT IF EXISTS receipt_lines_line_tax_check;
ALTER TABLE receipt_lines DROP CONSTRAINT IF EXISTS receipt_lines_line_total_check;
ALTER TABLE receipt_lines DROP CONSTRAINT IF EXISTS receipt_lines_quantity_check;
