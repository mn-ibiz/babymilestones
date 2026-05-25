-- P1-E07-S04: VAT / tax treatment per service. Additive-only.
--
-- Each service declares its tax treatment so the receipt engine (P1-E08) and
-- eTIMS (P5) compute / display line-tax correctly. A non-null column with a
-- CHECK-constrained value set and a default of `vat_exempt` (KRA registration
-- is deferred — AC3). Mirrors TAX_TREATMENTS in @bm/contracts; db has no
-- dependency on contracts, so the CHECK is the runtime source of truth.
--
-- Allowed values (AC1):
--   * vat_inclusive  -> price already includes VAT (back out the tax portion)
--   * vat_exclusive  -> add VAT on top of the price
--   * vat_exempt     -> no VAT (default; KRA registration deferred — AC3)
--   * zero_rated     -> 0% rated supply (still a VATable line, rate 0)
--
-- The ADD COLUMN is guarded so the migration is idempotent (re-runnable). The
-- default backfills existing rows to `vat_exempt`, keeping the column non-null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'tax_treatment'
  ) THEN
    ALTER TABLE services
      ADD COLUMN tax_treatment text NOT NULL DEFAULT 'vat_exempt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_tax_treatment_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_tax_treatment_check
      CHECK (tax_treatment IN ('vat_inclusive', 'vat_exclusive', 'vat_exempt', 'zero_rated'));
  END IF;
END
$$;
