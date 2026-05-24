-- P1-E01-S05: PIN reset by OTP.
-- Additive-only: two new tables, no changes to existing rows.
--
-- otp_codes: one-time, time-limited reset codes. The 6-digit code is stored
-- hashed (SHA-256); single-use via consumed_at; 10-minute TTL via expires_at.
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'pin_reset',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_phone_idx ON otp_codes (phone);

-- sms_outbox: stub SMS delivery log. The launch adapter "delivers" by inserting
-- here; the provider-agnostic drainer is epic P1-E09.
CREATE TABLE IF NOT EXISTS sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  body text NOT NULL,
  template text,
  created_at timestamptz NOT NULL DEFAULT now()
);
