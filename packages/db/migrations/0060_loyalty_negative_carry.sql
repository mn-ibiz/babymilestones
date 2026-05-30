-- Migration 0060: loyalty negative-carry columns (Epic 26 / P3-E04-S01, S02).
-- Additive only. `negative_carry` flags a clawback that drove the balance below
-- zero (S01 AC4); `applied_to_negative_carry` records how much of a later earn
-- was used to repay that carry before becoming spendable (S02 AC2).

ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS negative_carry boolean NOT NULL DEFAULT false;
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS applied_to_negative_carry integer NOT NULL DEFAULT 0;
