-- P1-E03-S01: append-only wallet_ledger — the immutable spine of the wallet
-- system. Money is integer minor units (KES cents), bigint signed; credits are
-- positive, debits negative. NEVER floats. Additive-only.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id          uuid NOT NULL REFERENCES wallets(id),
  -- Signed integer cents (KES * 100). bigint for headroom; no float drift.
  amount             bigint NOT NULL,
  direction          text NOT NULL CHECK (direction IN ('credit', 'debit')),
  kind               text NOT NULL CHECK (kind IN ('topup', 'debit', 'refund', 'adjustment', 'reversal')),
  idempotency_key    text NOT NULL UNIQUE,
  posted_by          text NOT NULL,
  source             text NOT NULL,
  -- For a reversal, the entry being reversed (self-FK, nullable).
  reverses_entry_id  uuid REFERENCES wallet_ledger(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_wallet_id_idx ON wallet_ledger (wallet_id);
CREATE INDEX IF NOT EXISTS wallet_ledger_reverses_entry_id_idx ON wallet_ledger (reverses_entry_id);

-- Append-only enforcement (AC2/AC3). A trigger that RAISEs on UPDATE or DELETE
-- is the portable, single-source guarantee: it holds for the table owner and
-- superusers, and works under the PGlite test harness (single-superuser, so a
-- role REVOKE would be a no-op). This makes ledger mutation impossible at the
-- database layer, not just in application code.
CREATE OR REPLACE FUNCTION wallet_ledger_block_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_ledger_no_update ON wallet_ledger;
CREATE TRIGGER wallet_ledger_no_update
  BEFORE UPDATE ON wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION wallet_ledger_block_mutation();

DROP TRIGGER IF EXISTS wallet_ledger_no_delete ON wallet_ledger;
CREATE TRIGGER wallet_ledger_no_delete
  BEFORE DELETE ON wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION wallet_ledger_block_mutation();

-- Defence-in-depth (AC2): in production the app connects as the bm_app role,
-- which gets only INSERT/SELECT. Guarded so it is a no-op where the role does
-- not exist (e.g. the PGlite test harness).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bm_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON wallet_ledger TO bm_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON wallet_ledger FROM bm_app';
  END IF;
END;
$$;
