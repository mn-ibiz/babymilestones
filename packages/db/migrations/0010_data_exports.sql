-- P1-E02-S05: parent data-portability exports (Kenya DPA right of access).
-- One row per export request. The request endpoint inserts it 'pending'; the
-- async job gathers the parent's record, bundles a ZIP, stores it at a
-- signed-URL S3-equivalent, and flips the row to 'ready' with a single-use,
-- 7-day download token. The download endpoint consumes the token exactly once.
-- Additive-only.
CREATE TABLE IF NOT EXISTS data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The parent whose record is exported. FK to users (the session identity).
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending', -- pending | ready | failed
  -- Single-use download token (opaque, hashed-equivalent is unnecessary for the
  -- stub store; the value is unguessable and consumed exactly once).
  download_token text UNIQUE,
  -- Signed-URL / object key at the S3-equivalent store where the ZIP lives.
  storage_key text,
  -- Token validity window (7 days) and single-use bookkeeping.
  expires_at timestamptz,
  consumed_at timestamptz,
  failed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS data_exports_user_id_idx ON data_exports (user_id);
CREATE INDEX IF NOT EXISTS data_exports_download_token_idx ON data_exports (download_token);
