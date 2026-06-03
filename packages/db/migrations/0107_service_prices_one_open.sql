-- P1-E07-S01 review fix: enforce at most one OPEN (current) price row per service.
-- Without this, two concurrent setServicePrice() calls under READ COMMITTED can each
-- insert a row with effective_to IS NULL, making the price applied to a booking
-- non-deterministic and corrupting the effective-dated history. Additive partial
-- unique index; the application also locks the parent services row to serialise.
CREATE UNIQUE INDEX IF NOT EXISTS service_prices_one_open_per_service
  ON service_prices (service_id)
  WHERE effective_to IS NULL;
