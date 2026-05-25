-- P1-E04-S07: Bank transfer top-up (admin-confirmed). One additive-only table.
--
-- `bank_transfer_pending` — one row per bank transfer recorded manually by an
-- admin (or, in future, ingested from a bank API), awaiting a match to a parent
-- and confirmation. No automated reconciliation in P1 — manual entry only.
--
-- State machine: pending -> confirmed. On confirm an admin (or treasury) matches
-- the transfer to a parent and credits their wallet via packages/wallet using
-- THIS row's id as the wallet idempotency key, so a double-confirm cannot
-- double-credit (the ledger idempotency_key UNIQUE is the second layer). Money is
-- integer minor units (KES cents), bigint, positive.
CREATE TABLE IF NOT EXISTS bank_transfer_pending (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Amount received, integer minor units (KES cents). Positive.
  amount        bigint NOT NULL CHECK (amount > 0),
  -- Bank reference / narration captured from the transfer (free text).
  reference     text NOT NULL,
  -- Matched parent (users.id). NULL until an admin matches the transfer.
  parent_id     uuid REFERENCES users(id),
  -- pending (recorded, unmatched/unconfirmed) | confirmed (credited).
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed')),
  -- Admin/treasury user id that confirmed the credit. NULL while pending.
  confirmed_by  uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- List pending transfers oldest-first for the admin matching queue.
CREATE INDEX IF NOT EXISTS bank_transfer_pending_status_created_at_idx
  ON bank_transfer_pending (status, created_at);
