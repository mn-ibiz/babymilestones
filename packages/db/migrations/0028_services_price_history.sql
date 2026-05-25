-- P1-E07-S01: service catalogue + effective-dated price history. Additive-only.
--
-- `services` — the paid services admin manages without code changes (AC1).
-- `unit` is CHECK-constrained to the contract enum. No hard deletes: a retired
-- service is soft-deleted via is_active = false so booking history keeps its FK.
CREATE TABLE IF NOT EXISTS services (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  description               text,
  unit                      text NOT NULL CHECK (unit IN ('play', 'talent', 'salon', 'coaching', 'event')),
  is_active                 boolean NOT NULL DEFAULT true,
  -- Optional staff role a booking of this service must be attributed to (nullable).
  attribution_role_required text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- `service_prices` — effective-dated price history (AC2/AC3/AC4). A price change
-- closes the current open row (sets effective_to) and inserts a new row with a
-- null effective_to; amounts are integer cents (bigint), non-negative. The price
-- at a booking date is the row whose [effective_from, effective_to) half-open
-- range contains it.
CREATE TABLE IF NOT EXISTS service_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id     uuid NOT NULL REFERENCES services(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents >= 0),
  effective_from date NOT NULL,
  -- Exclusive upper bound; NULL = the open/current price.
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- A closed range must be well-formed (from strictly before to).
  CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Effective-dated lookup by service + date.
CREATE INDEX IF NOT EXISTS service_prices_service_id_effective_from_idx
  ON service_prices (service_id, effective_from);
