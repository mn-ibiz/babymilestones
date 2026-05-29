-- P2-E05-S01: loyalty earn/redeem ledger (append-only).
-- One row per loyalty movement. Earn rows are written for every settled payment
-- (AC1) and reference the wallet_ledger entry that triggered them (AC2). The
-- earn/redeem rate in force at the time is snapshotted onto the row (AC3) so a
-- later rate change never rewrites historical points.
--
-- Balance is DERIVED: SUM(earn.points) - SUM(redeem.points). Append-only: code
-- only ever INSERTs. `seq` gives a strict monotonic order for newest-first
-- history (created_at ties are not relied upon).
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL,
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  direction text NOT NULL CHECK (direction IN ('earn', 'redeem')),
  points integer NOT NULL CHECK (points > 0),
  -- Rate active when this row was written (KES per point). Snapshot for AC3.
  rate_snapshot integer NOT NULL CHECK (rate_snapshot > 0),
  -- The wallet_ledger entry that triggered this movement (AC2): for an earn it
  -- is the settled topup/debit; for a redeem it is the wallet credit created by
  -- the redemption. Nullable only for manual/system adjustments.
  wallet_ledger_entry_id uuid REFERENCES wallet_ledger(id),
  source_type text NOT NULL,
  source_id text,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_ledger_wallet_id_idx ON loyalty_ledger (wallet_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_wallet_seq_idx ON loyalty_ledger (wallet_id, seq DESC);
