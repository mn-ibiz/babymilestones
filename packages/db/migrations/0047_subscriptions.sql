-- P2-E02-S02: parent subscriptions. Additive.
--
-- A subscription is one parent+child enrolled in a plan: the full period is
-- pre-paid from the wallet at creation, and `entitlement_remaining` bookings are
-- granted for the current period. Status drives the lifecycle (pause/resume in
-- S04, cancel in S06, renewal/dunning in S05).

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            uuid NOT NULL REFERENCES parents(id),
  child_id             uuid NOT NULL REFERENCES children(id),
  plan_id              uuid NOT NULL REFERENCES subscription_plans(id),
  started_at           timestamptz NOT NULL DEFAULT now(),
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL,
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'paused', 'cancelled')),
  -- Bookings left in the current period; refilled to the plan entitlement on renewal.
  entitlement_remaining integer NOT NULL CHECK (entitlement_remaining >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Parent's subscriptions (dashboard) + per-child lookups.
CREATE INDEX IF NOT EXISTS subscriptions_parent_id_idx ON subscriptions (parent_id);
CREATE INDEX IF NOT EXISTS subscriptions_child_id_idx ON subscriptions (child_id);

-- Durable fence: at most one ACTIVE subscription per (child, plan). This is also
-- the idempotency anchor for the subscribe flow — a retry hits this before any
-- second wallet charge can post.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_child_plan_active_uniq
  ON subscriptions (child_id, plan_id)
  WHERE status = 'active';
