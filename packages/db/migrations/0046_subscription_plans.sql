-- P2-E02-S01: subscription plan catalogue + effective-dated plan prices. Additive.
--
-- A subscription plan ("8 Play sessions per month") grants `entitlement_count`
-- bookings of a service per `period`. Plans are admin-managed (CRUD + audit) and
-- their price is effective-dated exactly like service prices (P1-E07-S01): a
-- price change closes the current open row and inserts a new one — amounts are
-- never mutated in place.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        uuid NOT NULL REFERENCES services(id),
  name              text NOT NULL,
  -- Bookings granted per period; must be positive.
  entitlement_count integer NOT NULL CHECK (entitlement_count > 0),
  -- Billing/entitlement period.
  period            text NOT NULL CHECK (period IN ('week', 'month', 'term')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_plans_service_id_idx
  ON subscription_plans (service_id);

-- Effective-dated price history (mirrors service_prices). At most one open row
-- (effective_to IS NULL) per plan; a change closes the open row + inserts a new.
CREATE TABLE IF NOT EXISTS subscription_plan_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES subscription_plans(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents >= 0),
  effective_from date NOT NULL,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- A closed range must be well-formed (mirrors service_prices).
  CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Effective-dated lookup by plan + date (index-ordered, mirrors service_prices).
CREATE INDEX IF NOT EXISTS subscription_plan_prices_plan_id_idx
  ON subscription_plan_prices (plan_id, effective_from);
