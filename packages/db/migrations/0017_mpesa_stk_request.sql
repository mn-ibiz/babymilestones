-- P1-E04-S01: M-Pesa STK push initiation. One additive-only table.
--
-- `mpesa_stk_request` — one row per Daraja STK push the platform initiates on a
-- parent's behalf. Keyed for lookup by `checkout_request_id` (UNIQUE) — the
-- handle Daraja returns and later echoes on the C2B callback (P1-E04-S02), so
-- the callback can find this row idempotently. Money is integer minor units
-- (KES cents), bigint, positive. The state machine for THIS story is
-- `INITIATED → STK_SENT`; the callback (S02) advances to `CALLBACK_PENDING`
-- and beyond, and the reconciliation cron (S03) consumes `CALLBACK_PENDING`.
--
-- Daraja credentials live in env vars only — never in this table or any other.
-- The wallet credit happens later (S02) via packages/wallet; this row only
-- records that an STK push was initiated.
CREATE TABLE IF NOT EXISTS mpesa_stk_request (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Daraja's CheckoutRequestID — the durable handle echoed on the callback.
  -- UNIQUE so a callback (S02) can resolve exactly one row, and a duplicated
  -- initiation cannot create two records for the same checkout.
  checkout_request_id text NOT NULL UNIQUE,
  -- Daraja's MerchantRequestID (paired with the checkout id in the response).
  merchant_request_id text NOT NULL,
  -- The parent (users.id) who initiated the top-up. The session owner; never
  -- trusted from the client body.
  parent_id           uuid NOT NULL REFERENCES users(id),
  -- The wallet the eventual credit (S02) lands in. Derived server-side.
  wallet_id           uuid NOT NULL REFERENCES wallets(id),
  -- Amount requested, integer cents (KES * 100). Positive; Daraja itself caps
  -- a single STK call at 70,000 KES, validated in the contract layer.
  amount              bigint NOT NULL CHECK (amount > 0),
  -- Normalised payer MSISDN (+2547XXXXXXXX) the STK prompt was sent to.
  phone               text NOT NULL,
  -- State machine: INITIATED (row written, pre-Daraja) → STK_SENT (Daraja
  -- accepted the push). CALLBACK_PENDING/SUCCEEDED/FAILED are written by S02.
  state               text NOT NULL DEFAULT 'INITIATED'
    CHECK (state IN ('INITIATED', 'STK_SENT', 'CALLBACK_PENDING', 'SUCCEEDED', 'FAILED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Poll the latest request for a parent (status endpoint, AC4).
CREATE INDEX IF NOT EXISTS mpesa_stk_request_parent_id_created_at_idx
  ON mpesa_stk_request (parent_id, created_at DESC);
