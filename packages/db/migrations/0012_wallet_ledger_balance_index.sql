-- P1-E03-S02: balance is computed, never stored.
-- The wallet balance is always SUM(amount) over wallet_ledger; there is no
-- stored balance column (single source of truth eliminates reconciliation
-- drift). This migration adds the composite index that backs balance reads and
-- ledger-by-recency scans: (wallet_id, created_at DESC). Additive-only.
CREATE INDEX IF NOT EXISTS wallet_ledger_wallet_id_created_at_idx
  ON wallet_ledger (wallet_id, created_at DESC);
