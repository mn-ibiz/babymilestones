-- Migration 0059: loyalty_ledger (Epic 26 / P3-E04 — Loyalty Engine).
-- Additive only. Append-only points ledger: rows are NEVER updated or deleted.
-- Bootstraps the minimal ledger the four P3-E04 stories build on (the canonical
-- P2-E05 loyalty engine is not present on this branch). The reverses_* self-FK
-- backs the clawback reversing entry (P3-E04-S01).

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES users(id),
  points_delta integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('earn', 'redeem', 'clawback', 'adjustment')),
  posted_by text NOT NULL,
  reason text,
  reverses_loyalty_ledger_id uuid REFERENCES loyalty_ledger(id),
  source_wallet_ledger_id uuid REFERENCES wallet_ledger(id),
  earn_rate numeric,
  earned_amount_minor integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_ledger_parent_id_idx
  ON loyalty_ledger (parent_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_reverses_idx
  ON loyalty_ledger (reverses_loyalty_ledger_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_source_wallet_idx
  ON loyalty_ledger (source_wallet_ledger_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_parent_created_idx
  ON loyalty_ledger (parent_id, created_at DESC);

-- Append-only guard: forbid UPDATE/DELETE on the ledger (mirrors wallet_ledger,
-- migration 0011). The trigger is the portable single-source guarantee that
-- holds even for the table owner / under the PGlite test harness.
CREATE OR REPLACE FUNCTION loyalty_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'loyalty_ledger is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loyalty_ledger_no_update ON loyalty_ledger;
CREATE TRIGGER loyalty_ledger_no_update
  BEFORE UPDATE OR DELETE ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_immutable();
