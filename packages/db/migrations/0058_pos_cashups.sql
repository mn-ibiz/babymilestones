-- P2-E04-S05: end-of-day POS cash-up. Additive-only.
--
-- One row per till close: the expected takings by method (summed from paid
-- pos_sales since this cashier's previous cash-up), the cash physically counted,
-- and the signed variance (counted − expected cash). A variance over the
-- threshold requires a reason (route-enforced); any non-zero variance also posts
-- a pending reconciliation_adjustments row against the cash-drawer float
-- (P1-E06), linked here. All amounts are integer KES cents.
CREATE TABLE IF NOT EXISTS pos_cashups (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_user_id               uuid NOT NULL REFERENCES users(id),
  expected_cash_cents           bigint NOT NULL,
  expected_mpesa_cents          bigint NOT NULL,
  expected_paystack_cents       bigint NOT NULL,
  counted_cash_cents            bigint NOT NULL,
  variance_cents                bigint NOT NULL,
  reason                        text,
  reconciliation_adjustment_id  uuid REFERENCES reconciliation_adjustments(id),
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- "Since my last cash-up" scan: newest cash-up per cashier.
CREATE INDEX IF NOT EXISTS pos_cashups_cashier_created_at_idx
  ON pos_cashups (cashier_user_id, created_at);
