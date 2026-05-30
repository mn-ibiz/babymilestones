-- Migration 0061: loyalty pending-clawback column (Epic 26 / P3-E04-S04).
-- Additive only. `pending_clawback` records points provisionally reserved
-- against an earn whose source spend has a refund initiated-but-not-finalised,
-- so redemption excludes them (available_to_redeem = balance − Σ pending).

ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS pending_clawback integer NOT NULL DEFAULT 0;
