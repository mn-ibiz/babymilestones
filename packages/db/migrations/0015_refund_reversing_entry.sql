-- P1-E03-S06: refund recording (admin-only) creates a reversing entry.
-- Additive-only.
--
-- A refund is a NEW reversing wallet_ledger row (kind='refund',
-- reverses_entry_id set to the original debit) — the ledger is append-only, so
-- the original is never mutated. The reverses_entry_id self-FK already exists
-- (migration 0011); this migration adds the loyalty-clawback flag.
--
-- Loyalty proportional clawback is deferred to P3 (P3-E04). For now a refund
-- simply flags loyalty_clawback_pending=true on the new entry so the later job
-- can find entries awaiting clawback. Defaults false so existing rows are
-- untouched.
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS loyalty_clawback_pending boolean NOT NULL DEFAULT false;
