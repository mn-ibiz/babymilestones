-- P1-E10-S04: generic app settings (key/value store) for the admin Settings
-- sub-app. Additive-only. Backs the "general" settings sections that have no
-- dedicated table of their own — loyalty rates, branding (logo/colours), and
-- receipt branding. The other sections aggregated by the Settings area (SMS
-- provider config, float accounts) keep their existing dedicated tables.
--
-- One row per setting key; `value` is an arbitrary JSON document so a section's
-- shape can evolve without a schema change. Every mutation is audited to
-- `audit_outbox` at the API edge (AC3).
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
