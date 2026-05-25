-- P1-E09-S03: SMS templates registered + versioned.
-- Additive-only. Templates are addressed by a logical `key` (e.g.
-- 'topup.success') and carry a `body` with `{placeholder}` tokens that the
-- @bm/sms resolver interpolates from the send `data` bag at send time (AC1/AC2).
-- This is what lets send({template}) stay provider- and copy-agnostic: the copy
-- lives in the DB, not in inline strings.
--
-- Versioning (AC1): a (key, language) may have many rows across versions; only
-- one is `is_active`. A partial unique index enforces "one active per (key,
-- language)" so a template change ships as a new row + an active flip, leaving
-- the prior version on record. The body of an active row is never mutated in
-- P1 (read-only admin); P2 adds editing by inserting a higher version.
CREATE TABLE IF NOT EXISTS sms_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical template key, e.g. 'topup.success'.
  key         text NOT NULL,
  -- BCP-47-ish language tag; launch ships 'en' only.
  language    text NOT NULL DEFAULT 'en',
  -- Monotonic version per (key, language); a new copy revision = a new row.
  version     integer NOT NULL DEFAULT 1,
  -- Message body with {placeholder} tokens interpolated from the send data bag.
  body        text NOT NULL,
  -- Exactly one active row per (key, language) (partial unique index below).
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- AC1: at most one active template per (key, language). Versions accumulate;
-- only the active one resolves at send time.
CREATE UNIQUE INDEX IF NOT EXISTS sms_templates_active_key_lang_idx
  ON sms_templates (key, language) WHERE is_active = true;

-- A (key, language, version) is unique regardless of active state, so version
-- history is well-formed (no two rows claim the same revision).
CREATE UNIQUE INDEX IF NOT EXISTS sms_templates_key_lang_version_idx
  ON sms_templates (key, language, version);

-- Seed the launch template set as registered, versioned rows (AC1/AC2). Bodies
-- use {placeholder} tokens; the resolver interpolates them from the send data.
-- These mirror the in-code launch copy so send(...) is fully DB-driven.
INSERT INTO sms_templates (key, language, version, body, is_active) VALUES
  ('topup.success',             'en', 1, 'A top-up of KES {amountKes} was added to your wallet.', true),
  ('auth.reset.code',           'en', 1, 'Your Baby Milestones reset code is {code}. It expires in 10 minutes.', true),
  ('wallet.topup.bank',         'en', 1, 'A bank transfer of KES {amountKes} was added to your wallet.', true),
  ('wallet.topup.cash',         'en', 1, 'A cash top-up of KES {amountKes} was added to your wallet.', true),
  ('wallet.refund',             'en', 1, 'A refund of KES {amountKes} has been recorded to your wallet.', true),
  ('payment.mpesa.failed',      'en', 1, 'Your M-Pesa top-up of KES {amountKes} could not be completed. No money was deducted. Please try again.', true),
  ('parent.data.export.ready',  'en', 1, 'Your Baby Milestones data export is ready. Download (valid 7 days, one-time): {link}', true)
ON CONFLICT (key, language, version) DO NOTHING;
