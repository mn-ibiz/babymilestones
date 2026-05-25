-- P1-E12-S03: WhatsApp deep-link attribution. Capture the UTM params that drove
-- a signup (utm_source/medium/campaign/term/content) on the parent record so a
-- signup can be attributed to the ad that produced it. Stored as jsonb (a small,
-- shape-flexible attribution blob); nullable so an organic signup carries no
-- attribution. Additive-only.
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS acquisition_source jsonb;
