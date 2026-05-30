-- eTIMS receipt status (P5-E02-S01). Additive, nullable: the live eTIMS writer
-- stamps 'accepted' on receipts it registers with KRA; local receipts stay NULL.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS etims_status text;
