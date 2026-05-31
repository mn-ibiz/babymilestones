-- Migration 0083: loyalty_ledger append-only guard (Epic 26 / P3-E04 — Loyalty Engine).
-- Append-only points ledger: rows are NEVER updated or deleted.
--
-- NOTE ON COEXISTENCE: this epic was developed on a branch where the P2-E05
-- loyalty engine (migration 0064) was absent, so the CREATE below described the
-- full P3-E04 shape. On main, 0064 already created loyalty_ledger with the
-- P2-E05 columns, so the CREATE IF NOT EXISTS is a no-op here and the P3-E04
-- columns (parent_id, points_delta, kind, …) plus their indexes are added —
-- NULLABLE, so both engines coexist — by migration 0087. The CREATE is kept
-- only for fresh-install documentation; do not rely on its NOT NULL/columns on
-- a main-derived database. The reverses_* self-FK backs the clawback reversing
-- entry (P3-E04-S01).

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

-- Indexes on the P3-E04 columns live in migration 0087, which is where those
-- columns are guaranteed to exist on a main-derived database (0064 created the
-- table without them, so a CREATE INDEX here would fail with "column ... does
-- not exist" before 0087's ALTERs run).

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
