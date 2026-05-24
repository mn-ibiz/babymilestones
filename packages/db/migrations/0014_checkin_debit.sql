-- P1-E03-S05: debit at check-in; pending invoice settled. Additive-only.
--
-- Extends the invoice/settlement model from S04 to support the check-in debit
-- path: an invoice now carries the booked service, can resolve to one of four
-- check-in outcomes, and a per-invoice UNIQUE fence blocks a double check-in
-- from posting a second debit for the same invoice (AC6).

-- 1) auto_credit_enabled on the wallet. Default OFF (the per-parent toggle is
--    P1-E03-S07; this story only reads the flag). When false, an underfunded
--    check-in leaves the invoice outstanding instead of going negative (AC5).
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS auto_credit_enabled boolean NOT NULL DEFAULT false;

-- 2) service_id on the invoice (AC1). Nullable uuid — the services catalogue is
--    a later epic (P1-E07); no FK yet so this stays forward-compatible without
--    pulling that table forward.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS service_id uuid;

-- 3) Extend the invoice status CHECK to the four check-in outcomes (AC3–AC5).
--    `settled`        — paid in full from wallet balance.
--    `settled_on_credit` — debited under auto-credit; wallet may be negative.
--    `outstanding`    — underfunded, auto-credit off; no debit, booking proceeds.
--    `pending`        — created at booking, not yet checked in (AC1) / S04 FIFO.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'settled', 'settled_on_credit', 'outstanding'));

-- 4) Settlement-linkage discriminator + double-check-in fence (AC6).
--    `kind` distinguishes a check-in debit ('checkin') from S04's FIFO top-up
--    settlements ('topup'). A PARTIAL UNIQUE index on (invoice_id) WHERE
--    kind='checkin' guarantees at most ONE check-in debit per invoice — a second
--    check-in for the same invoice violates the index (a clear 23505 conflict) —
--    while leaving S04's many-row FIFO settlements unconstrained.
ALTER TABLE wallet_ledger_invoice_settlement
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'topup'
  CHECK (kind IN ('topup', 'checkin'));

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_invoice_settlement_checkin_uniq
  ON wallet_ledger_invoice_settlement (invoice_id)
  WHERE kind = 'checkin';
