-- P5-E01-S05 (Story 31.5): Sensitive flow — discreet billing labels. Additive-only.
--
-- A sensitive coaching offering can be billed under a NEUTRAL display label so a
-- receipt (and the booking SMS) never names the real, sensitive service. The
-- substitution is a DISPLAY concern only: the stored ledger / invoice / receipt
-- line keep their real `service_id` — only what the parent SEES on the receipt
-- line and in the confirmation SMS changes. Admin toggles it per service (AC3).
--
-- Two additive, nullable columns on `services`:
--
--   1. `discreet_billing_enabled` — boolean, NOT NULL DEFAULT false. When true,
--      the receipt engine renders `discreet_billing_label` as the line
--      description instead of the real `name`, and coaching confirmations use
--      neutral language (no sensitive service detail).
--   2. `discreet_billing_label` — the neutral label to show, e.g. "BM Coaching
--      Session". Nullable; required (non-empty) at the contract layer when
--      enabled. CHECK guards that an enabled row has a non-blank label.

-- 1) The per-service toggle. NOT NULL, defaults false so existing rows are
--    unaffected and non-sensitive services keep showing their real name.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS discreet_billing_enabled boolean NOT NULL DEFAULT false;

-- 2) The neutral display label. Nullable; only meaningful when enabled.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS discreet_billing_label text;

-- An enabled row MUST carry a non-blank label (so the receipt never falls back to
-- the real name). A disabled row may leave the label null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_discreet_billing_label_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_discreet_billing_label_check
      CHECK (
        discreet_billing_enabled = false
        OR (discreet_billing_label IS NOT NULL AND length(btrim(discreet_billing_label)) > 0)
      );
  END IF;
END
$$;
