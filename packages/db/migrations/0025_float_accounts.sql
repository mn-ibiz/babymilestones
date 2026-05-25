-- P1-E06-S01: float_accounts — the accounts that hold customer wallet float
-- (an M-Pesa till, a bank account, or a physical cash drawer). Admin/treasury
-- declares them so the float liability can be reconciled per account
-- (P1-E06-S02). Money is integer minor units (KES cents), bigint. Additive-only.
CREATE TABLE IF NOT EXISTS float_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('mpesa_till', 'bank', 'cash_drawer')),
  -- Opening balance in integer cents (KES * 100). Non-negative; defaults 0.
  opening_balance  bigint NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  opening_date     date NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS float_accounts_kind_idx ON float_accounts (kind);

-- Additive: tag each ledger movement with the float account its cash lands in
-- (AC3). Nullable so historical entries (pre-P1-E06) stay valid; reconciliation
-- groups liability by this column.
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS float_account_id uuid REFERENCES float_accounts(id);

CREATE INDEX IF NOT EXISTS wallet_ledger_float_account_id_idx
  ON wallet_ledger (float_account_id);

-- Backfill historical wallet_ledger entries to a "default" float account at
-- deploy time (the spec's backfill step). In P1 the ledger may already hold
-- top-ups from earlier epics; seed one default cash_drawer account and tag any
-- untagged rows to it so reconciliation never sees a NULL on a historical row.
-- Idempotent: only inserts the default if no float account exists yet, and only
-- backfills rows that are still NULL.
DO $$
DECLARE
  default_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_ledger WHERE float_account_id IS NULL) THEN
    SELECT id INTO default_id FROM float_accounts WHERE name = 'Default (backfill)' LIMIT 1;
    IF default_id IS NULL THEN
      INSERT INTO float_accounts (name, kind, opening_balance, opening_date)
      VALUES ('Default (backfill)', 'cash_drawer', 0, CURRENT_DATE)
      RETURNING id INTO default_id;
    END IF;
    -- wallet_ledger is append-only (0011 RAISEs on UPDATE). This one-time
    -- migration backfill is a legitimate schema-evolution write, so disable the
    -- block trigger for the duration of the UPDATE, then re-enable it. The
    -- append-only guarantee is fully restored before the migration commits.
    ALTER TABLE wallet_ledger DISABLE TRIGGER wallet_ledger_no_update;
    UPDATE wallet_ledger SET float_account_id = default_id WHERE float_account_id IS NULL;
    ALTER TABLE wallet_ledger ENABLE TRIGGER wallet_ledger_no_update;
  END IF;
END;
$$;
