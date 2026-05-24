-- P1-E02-S04: photo & SMS consent flags. Per-child photography consent and
-- per-parent SMS marketing opt-in. Both default false (explicit opt-in) so no
-- existing record is silently consented. Additive-only.
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS sms_marketing_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS photo_consent boolean NOT NULL DEFAULT false;
