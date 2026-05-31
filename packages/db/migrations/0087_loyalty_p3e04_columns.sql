-- Migration 0087: Add P3-E04 (Epic 26) columns to loyalty_ledger individually.
-- The P2-E05 migration (0064) created the table; Epic 26 uses parentId/pointsDelta/kind.
-- All columns are nullable so existing P2-E05 rows are unaffected.

ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES users(id);
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS points_delta integer;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS posted_by text;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS reverses_loyalty_ledger_id uuid REFERENCES loyalty_ledger(id);
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS source_wallet_ledger_id uuid REFERENCES wallet_ledger(id);
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS earn_rate numeric;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS earned_amount_minor integer;

-- Coexistence: 0064 (P2-E05) created the original P2-E05 columns as NOT NULL,
-- but P3-E04 (Epic 26) rows populate the parent_id/points_delta/kind columns and
-- leave the P2-E05 columns NULL. Relax NOT NULL on those columns so both engines
-- can append to one ledger (this matches the merged Drizzle schema in
-- schema/loyalty.ts, where these columns are nullable). Existing P2-E05 rows keep
-- their values; only future inserts may omit them. The CHECK constraints are left
-- intact — a NULL value passes a CHECK, so they still guard non-NULL P2-E05 rows.
ALTER TABLE loyalty_ledger ALTER COLUMN wallet_id DROP NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN direction DROP NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN points DROP NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN rate_snapshot DROP NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN source_type DROP NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN idempotency_key DROP NOT NULL;

-- Indexes for the P3-E04 columns. These live here (not in 0083) because this is
-- where the columns are guaranteed to exist on a main-derived database.
CREATE INDEX IF NOT EXISTS loyalty_ledger_parent_id_idx ON loyalty_ledger (parent_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_reverses_idx ON loyalty_ledger (reverses_loyalty_ledger_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_source_wallet_idx ON loyalty_ledger (source_wallet_ledger_id);
CREATE INDEX IF NOT EXISTS loyalty_ledger_parent_created_idx ON loyalty_ledger (parent_id, created_at DESC);
