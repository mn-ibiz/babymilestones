-- P2-E04-S04: in-store POS sale + payment state machine. Additive-only.
--
-- A sale is created `pending`, then settled to `paid` (receipt written, stock
-- decremented) or `failed`. Cash + wallet settle synchronously; M-Pesa STK +
-- Paystack stay pending until the cashier confirms the payment. Line items are
-- stored as JSON so an async sale settles later from the same snapshot (the
-- authoritative post-settlement line record is receipt_lines). All amounts are
-- integer KES cents. 19-5 (end-of-day cash-up) sums paid sales by method.
CREATE TABLE IF NOT EXISTS pos_sales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_user_id  uuid NOT NULL REFERENCES users(id),
  method           text NOT NULL CHECK (method IN ('cash', 'mpesa', 'paystack', 'wallet')),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  subtotal_cents   bigint NOT NULL,
  discount_cents   bigint NOT NULL,
  tax_cents        bigint NOT NULL,
  total_cents      bigint NOT NULL CHECK (total_cents >= 0),
  lines            jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_phone   text,
  parent_id        uuid REFERENCES parents(id),
  payment_ref      text,
  receipt_id       uuid REFERENCES receipts(id),
  failure_reason   text,
  -- Client-supplied per-attempt key: a replayed POST returns the existing sale
  -- rather than charging twice (double-submit guard).
  idempotency_key  text,
  -- Set when an end-of-day cash-up (S05) counts this paid sale into its totals.
  -- NULL = not yet cashed up. Guarantees each sale is counted in exactly one
  -- close (the cash-up claims rows atomically: UPDATE … WHERE cashed_up_at IS NULL).
  cashed_up_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Uncashed paid-sale scan for the end-of-day cash-up (S05), per cashier.
CREATE INDEX IF NOT EXISTS pos_sales_uncashed_idx
  ON pos_sales (cashier_user_id) WHERE status = 'paid' AND cashed_up_at IS NULL;

-- One sale per client idempotency key (when provided).
CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_idempotency_key_uniq
  ON pos_sales (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- End-of-day cash-up (S05) scans paid sales by method for the day.
CREATE INDEX IF NOT EXISTS pos_sales_status_method_created_at_idx
  ON pos_sales (status, method, created_at);

-- Resolve an async sale by its provider handle (M-Pesa checkoutRequestId / Paystack ref).
CREATE INDEX IF NOT EXISTS pos_sales_payment_ref_idx
  ON pos_sales (payment_ref) WHERE payment_ref IS NOT NULL;
