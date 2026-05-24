-- P1-E04-S02: M-Pesa C2B/STK callback persistence. One additive-only table.
--
-- `mpesa_callback` — one row per Daraja STK callback the platform receives. The
-- handler is **idempotent on `checkout_request_id`**: the callback insert runs
-- `ON CONFLICT (checkout_request_id) DO NOTHING`, so a callback that Daraja
-- retries (it retries on any non-200) is recorded exactly once and never
-- double-credits the wallet.
--
-- The row `id` (PK) is used as the wallet idempotency key when crediting the
-- top-up via @bm/wallet, layering a SECOND idempotency guarantee on top of the
-- table UNIQUE: even if the same checkout id were somehow processed twice, the
-- ledger UNIQUE(idempotency_key) keeps the credit to exactly one entry.
--
-- The raw Daraja payload is stored verbatim (jsonb) for audit/forensics; it is
-- treated as untrusted input and never echoed back. `result_code` is the
-- Daraja ResultCode (0 = success, non-zero = the payer cancelled / it failed).
CREATE TABLE IF NOT EXISTS mpesa_callback (
  -- PK doubles as the wallet idempotency key for the eventual credit.
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Daraja's CheckoutRequestID echoed on the callback. UNIQUE so a retried /
  -- duplicate callback collapses to ON CONFLICT DO NOTHING (the idempotency
  -- spine of this story). Not a FK: an out-of-order callback may arrive before
  -- the mpesa_stk_request row is committed (AC5).
  checkout_request_id text NOT NULL UNIQUE,
  -- Daraja's MerchantRequestID, when present in the payload.
  merchant_request_id text,
  -- Daraja ResultCode: 0 = success, non-zero = failed/cancelled.
  result_code         integer NOT NULL,
  -- Human-readable ResultDesc from Daraja (untrusted; for audit only).
  result_desc         text,
  -- The full raw callback body, stored verbatim for forensics.
  raw_payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
