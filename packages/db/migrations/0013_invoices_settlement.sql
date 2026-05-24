-- P1-E03-S04: FIFO top-up settlement. Two additive-only tables.
--
-- `invoices` — an outstanding amount owed by a parent (e.g. a check-in debit
-- that exceeded the wallet balance). `amount_due` is integer minor units (KES
-- cents), bigint signed-but-non-negative; FIFO settlement reduces it. Status is
-- `pending` until fully cleared, then `settled`. Oldest `created_at` is paid
-- first (AC1).
CREATE TABLE IF NOT EXISTS invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES parents(id),
  -- Remaining amount owed, integer cents. Reduced on partial settlement (AC3),
  -- reaches 0 when the invoice closes. Never negative.
  amount_due  bigint NOT NULL CHECK (amount_due >= 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- FIFO scan: outstanding invoices for a parent, oldest first.
CREATE INDEX IF NOT EXISTS invoices_parent_id_created_at_idx
  ON invoices (parent_id, created_at);

-- `wallet_ledger_invoice_settlement` — linkage row recording that a single
-- `wallet_ledger` posting settled (part of) an invoice (AC5). One row per
-- (ledger entry, invoice) settlement; `amount` is the cents applied to that
-- invoice by that ledger entry. Append-only by convention; never updated.
CREATE TABLE IF NOT EXISTS wallet_ledger_invoice_settlement (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL REFERENCES wallet_ledger(id),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  -- Cents applied to this invoice by this ledger entry. Positive.
  amount          bigint NOT NULL CHECK (amount > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_invoice_settlement_invoice_id_idx
  ON wallet_ledger_invoice_settlement (invoice_id);
CREATE INDEX IF NOT EXISTS wallet_ledger_invoice_settlement_ledger_entry_id_idx
  ON wallet_ledger_invoice_settlement (ledger_entry_id);
