-- P1-E04-S04: Paystack card top-up initiation. One additive-only table.
--
-- `paystack_transaction` — one row per Paystack hosted-checkout transaction the
-- platform initiates on a parent's behalf. Keyed for lookup by `reference`
-- (UNIQUE, a UUID we generate) — the handle Paystack echoes on `transaction/
-- verify` (this story) and on the `charge.success` webhook (P1-E04-S05), so both
-- resolve exactly one row idempotently. Money is integer minor units (KES cents),
-- bigint, positive.
--
-- The Paystack SECRET key lives in env vars only — never in this table or any
-- other. The wallet credit happens later (S05) via packages/wallet on the
-- verified webhook; this row only records that a checkout was initiated and (on
-- redirect-back verify) the UX-confirmation outcome.
CREATE TABLE IF NOT EXISTS paystack_transaction (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The client reference (UUID) we generate. UNIQUE so a verify/webhook resolves
  -- exactly one row, and a duplicated initiation cannot create two records.
  reference           text NOT NULL UNIQUE,
  -- The parent (users.id) who initiated the top-up. The session owner; never
  -- trusted from the client body.
  parent_id           uuid NOT NULL REFERENCES users(id),
  -- The wallet the eventual credit (S05) lands in. Derived server-side.
  wallet_id           uuid NOT NULL REFERENCES wallets(id),
  -- Amount requested, integer minor units (KES cents). Positive.
  amount              bigint NOT NULL CHECK (amount > 0),
  -- Payer email passed to Paystack (the parent's profile email).
  email               text NOT NULL,
  -- AC4: card-on-file — whether the parent opted to save the card authorization
  -- for repeat top-ups. The saved authorization_code is captured on verify/webhook.
  save_card           boolean NOT NULL DEFAULT false,
  -- Paystack saved authorization token (card-on-file), captured on a successful
  -- verify when reusable. NULL until/unless a reusable card is confirmed.
  authorization_code  text,
  -- State machine: INITIALIZED (checkout created) → SUCCEEDED | FAILED |
  -- ABANDONED. The redirect-back verify (this story) and the webhook (S05) both
  -- advance it; the webhook remains the source of truth for crediting.
  state               text NOT NULL DEFAULT 'INITIALIZED'
    CHECK (state IN ('INITIALIZED', 'SUCCEEDED', 'FAILED', 'ABANDONED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Poll the latest transaction for a parent (status endpoint).
CREATE INDEX IF NOT EXISTS paystack_transaction_parent_id_created_at_idx
  ON paystack_transaction (parent_id, created_at DESC);
