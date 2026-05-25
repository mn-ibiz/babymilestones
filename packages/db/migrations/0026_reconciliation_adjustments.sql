-- P1-E06-S02: Daily reconciliation screen — adjusting entries.
--
-- `reconciliation_adjustments` — one row per adjusting entry an operator posts
-- to correct drift between the system-tracked float balance (SUM of
-- wallet_ledger grouped by float_account_id) and the real-world account balance.
--
-- Dual-approval (AC3): an admin POSTS the adjustment (status `pending`); a
-- treasury-role user APPROVES it (status `approved`) — the two actors must be
-- distinct (no self-approval).
--
-- Reversing-entry pattern (AC4): this table is append-only at the application
-- layer — an approved or rejected adjustment is terminal and is NEVER mutated or
-- deleted. To undo a posted adjustment an operator posts a NEW reversing
-- adjustment (`reverses_adjustment_id` points at the original, amount negated),
-- so the full history of every correction is preserved and auditable.
--
-- Money is integer minor units (KES cents), bigint, signed (an adjustment can be
-- positive or negative — it brings the system figure toward the real one). A
-- rejected adjustment is terminal. Additive-only.
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  float_account_id  uuid NOT NULL REFERENCES float_accounts(id),
  -- Signed integer cents (KES * 100). The amount applied to bring the system
  -- balance toward the real-world balance. Non-zero.
  amount            bigint NOT NULL CHECK (amount <> 0),
  -- Why the adjustment is being made (required — AC3).
  reason            text NOT NULL,
  -- The admin who posted the adjustment (users.id).
  posted_by         uuid NOT NULL REFERENCES users(id),
  -- The treasury user who approved it (users.id). NULL while pending.
  approved_by       uuid REFERENCES users(id),
  -- pending (posted, awaiting approval) | approved (applied to the system
  --   reconciliation figure) | rejected (terminal).
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Reversing-entry pattern (AC4): the prior adjustment this one reverses, if
  -- any. NULL for an original adjustment. Self-FK keeps the full correction
  -- history without ever mutating the original row.
  reverses_adjustment_id uuid REFERENCES reconciliation_adjustments(id),
  -- A poster cannot approve their own adjustment (dual-approval — AC3).
  CONSTRAINT reconciliation_adjustments_distinct_approver
    CHECK (approved_by IS NULL OR approved_by <> posted_by),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- List adjustments per account, newest-first, for the reconciliation screen.
CREATE INDEX IF NOT EXISTS reconciliation_adjustments_float_account_id_idx
  ON reconciliation_adjustments (float_account_id, created_at);

-- The pending-approval queue (treasury approves these).
CREATE INDEX IF NOT EXISTS reconciliation_adjustments_status_idx
  ON reconciliation_adjustments (status);
