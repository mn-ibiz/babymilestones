-- P2-E02-S01 review fix: enforce at most one OPEN (current) price row per plan.
-- Mirrors 0107 for service_prices. Without this, two concurrent setPlanPrice()
-- calls under READ COMMITTED can each insert an effective_to IS NULL row, making
-- the price applied to a subscription non-deterministic. Additive partial index;
-- the application also locks the parent subscription_plans row to serialise.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plan_prices_one_open_per_plan
  ON subscription_plan_prices (plan_id)
  WHERE effective_to IS NULL;
