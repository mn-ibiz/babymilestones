-- P1-E02-S02: Reception registers walk-in parent. Additive-only.
--
-- A walk-in parent is created by staff with NO PIN set initially; they verify
-- via OTP on first self-login (Story Technical Notes). Two changes to `users`:
--   1. Relax the pin_hash NOT NULL constraint so a credential-less account can
--      exist. (Relaxing a constraint is additive — existing rows are unaffected
--      and all current code still sets pin_hash.)
--   2. Add pin_set_at: NULL means "no PIN chosen yet → must set/verify via OTP
--      on first self-login"; a timestamp records when the parent set their PIN.
ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at timestamptz;

-- Reception may create a parent (walk-in registration). This extends the
-- (role, action, resource) matrix seeded in 0005 and MUST stay in lock-step
-- with PERMISSION_MATRIX in packages/auth/src/rbac.ts (the snapshot test and
-- the db drift gate both guard this).
INSERT INTO permissions (role, action, resource) VALUES
  ('reception', 'create', 'user')
ON CONFLICT (role, action, resource) DO NOTHING;
