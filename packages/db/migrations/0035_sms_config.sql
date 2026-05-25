-- P1-E09-S02: admin SMS provider config (sender ID + URL + key reference).
-- Additive-only. Stores the provider connection an admin registers once a
-- sender ID is approved, so the live provider can be activated without a code
-- change. The API KEY ITSELF IS NEVER STORED: only `api_key_ref`, the NAME of
-- the env var / secret reference that holds the key at runtime (AC1/AC2).
CREATE TABLE IF NOT EXISTS sms_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    text NOT NULL,
  -- HTTPS + non-SSRF host enforced at the edge (@bm/sms checkProviderUrlSafety, AC3).
  api_url      text NOT NULL,
  -- Env-var NAME holding the key (e.g. 'SMS_API_KEY') — never the literal key.
  api_key_ref  text NOT NULL,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- AC4: at most one row may be active. A partial unique index over a constant
-- expression — every active row collides on the same key, so a second active
-- row is rejected at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS sms_config_single_active_idx
  ON sms_config ((true)) WHERE is_active = true;

-- Grant admin `manage config`, which gates the SMS-config CRUD surface (admin +
-- super_admin only). Additive-only — mirrors the matrix update in
-- packages/auth/src/rbac.ts (the snapshot test enforces parity).
INSERT INTO permissions (role, action, resource) VALUES
  ('admin', 'manage', 'config')
ON CONFLICT (role, action, resource) DO NOTHING;
