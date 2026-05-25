-- P1-E08-S01: Receipt schema with nullable eTIMS/KRA fields. Additive-only.
--
-- The receipt model is KRA-shaped *today* so adopting eTIMS in P5 is a writer
-- swap, not a schema migration. The KRA fields (pin, control_unit_number,
-- cu_invoice_number, qr_data, etims_status) are all NULLABLE now: the
-- LocalReceiptWriter (P1-E08-S02) leaves them empty, a future EtimsReceiptWriter
-- fills them. Money is integer minor units (KES cents), bigint, non-negative.
--
-- Humans see a per-series sequence like `BM-2026-000123`: `series` is the
-- namespace (`BM-2026`) and `sequence_number` is the monotonic counter within
-- it. (series, sequence_number) is UNIQUE (AC3). The display format
-- `<series>-<zero-padded-sequence_number>` is rendered by the writer, not stored.

CREATE TABLE IF NOT EXISTS receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series              text NOT NULL,
  sequence_number     bigint NOT NULL,
  -- Optional pointer to an original receipt (e.g. a credit-note / reversal).
  parent_id           uuid REFERENCES receipts(id),
  -- Money, integer cents. total = sum of line totals; tax_total = sum of line tax.
  total               bigint NOT NULL CHECK (total >= 0),
  tax_total           bigint NOT NULL CHECK (tax_total >= 0),
  payment_method      text NOT NULL,
  posted_by           text NOT NULL,
  -- Parent account the receipt belongs to (nullable — walk-ins have none).
  parent_account_id   uuid REFERENCES parents(id),
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- KRA / eTIMS fields — all NULLABLE until eTIMS goes live in P5 (AC1).
  pin                 text,
  control_unit_number text,
  cu_invoice_number   text,
  qr_data             text,
  -- Nullable ENUM; CHECK is the runtime source of truth (db has no contracts dep).
  etims_status        text CHECK (etims_status IN ('pending', 'sent', 'accepted', 'rejected')),

  -- Per-series sequence uniqueness — the humans-see-a-series guarantee (AC3).
  CONSTRAINT receipts_series_sequence_number_key UNIQUE (series, sequence_number)
);

CREATE INDEX IF NOT EXISTS receipts_parent_account_id_idx
  ON receipts (parent_account_id);

-- `receipt_lines` — one row per charged item (AC2). Exactly one of service_id /
-- product_id is set. unit_price / line_tax / line_total are integer cents. VAT
-- per line is captured at write time from the service's vatable tax treatment.
CREATE TABLE IF NOT EXISTS receipt_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid NOT NULL REFERENCES receipts(id),
  -- Set iff product_id is null. FK to the services catalogue.
  service_id  uuid REFERENCES services(id),
  -- Set iff service_id is null. No products table yet, so no FK.
  product_id  uuid,
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  bigint NOT NULL CHECK (unit_price >= 0),
  line_tax    bigint NOT NULL CHECK (line_tax >= 0),
  line_total  bigint NOT NULL CHECK (line_total >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of service_id / product_id is set (AC2).
  CONSTRAINT receipt_lines_one_of_service_product_check
    CHECK ((service_id IS NOT NULL) <> (product_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS receipt_lines_receipt_id_idx
  ON receipt_lines (receipt_id);
