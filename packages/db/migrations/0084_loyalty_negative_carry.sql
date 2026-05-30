-- 0084_loyalty_negative_carry.sql — negative-carry tracking columns (P3-E04-S02).
-- Additive: applied_to_negative_carry + negative_carry already ship in
-- 0083's CREATE for fresh installs; this guards older databases that ran an
-- earlier ledger migration without them. No-op where the columns already exist.
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS applied_to_negative_carry integer NOT NULL DEFAULT 0;
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS negative_carry boolean NOT NULL DEFAULT false;
