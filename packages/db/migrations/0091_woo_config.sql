-- P4-E04-S06 (Story 29.6): WooCommerce REST API connection config.
-- Additive-only. Stores the single WooCommerce connection an admin registers
-- from the Settings "WooCommerce" panel so all sync work talks to one surface.
--
-- Secret hygiene (AC3): UNLIKE sms_config (which stores only an env-var ref), the
-- consumer key + secret are stored ENCRYPTED AT REST here — consumer_key_enc /
-- consumer_secret_enc hold the AES-256-GCM `v1:...` envelope produced by
-- @bm/woocommerce encryptSecret. The plaintext is accepted on save only and is
-- NEVER returned to the client (write-only field); reads use a secret-free
-- projection.
CREATE TABLE IF NOT EXISTS woo_config (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- HTTPS enforced at the edge (@bm/contracts + the API route). Not a secret.
  site_url             text NOT NULL,
  -- AES-256-GCM ciphertext (`v1:...`) of the consumer key, or NULL when unset.
  consumer_key_enc     text,
  -- AES-256-GCM ciphertext (`v1:...`) of the consumer secret, or NULL when unset.
  consumer_secret_enc  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- AC3: at most one WooCommerce connection. A partial unique index over a
-- constant expression — every row collides on the same key, so a second row is
-- rejected at the database level (mirrors sms_config_single_active_idx).
CREATE UNIQUE INDEX IF NOT EXISTS woo_config_singleton_idx
  ON woo_config ((true));

-- The WooCommerce panel is gated by `manage config` (admin + super_admin),
-- already granted to admin in migration 0035. No new permission row needed.
