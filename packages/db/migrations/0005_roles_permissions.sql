-- P1-E01-S06: role taxonomy + (role, action, resource) permission matrix.
-- Additive-only. The seeded rows MIRROR packages/auth/src/rbac.ts
-- (PERMISSION_MATRIX); the snapshot test fails CI if code drifts from this
-- migration. Enforcement is server-side via requirePermission(...) — the
-- client is never trusted.

-- AC1: the eight seeded roles.
CREATE TABLE IF NOT EXISTS roles (
  role       text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (role) VALUES
  ('parent'),
  ('reception'),
  ('cashier'),
  ('packer'),
  ('accountant'),
  ('treasury'),
  ('admin'),
  ('super_admin')
ON CONFLICT (role) DO NOTHING;

-- AC2: permissions referenced by API middleware (requirePermission guard).
CREATE TABLE IF NOT EXISTS permissions (
  role       text NOT NULL REFERENCES roles(role),
  action     text NOT NULL,
  resource   text NOT NULL,
  PRIMARY KEY (role, action, resource)
);

-- Seed rows mirror PERMISSION_MATRIX in rbac.ts. '*' is the wildcard.
INSERT INTO permissions (role, action, resource) VALUES
  -- parent
  ('parent', 'read', 'wallet'),
  ('parent', 'read', 'receipt'),
  ('parent', 'create', 'payment'),
  -- reception
  ('reception', 'read', 'wallet'),
  ('reception', 'create', 'payment'),
  ('reception', 'read', 'receipt'),
  ('reception', 'read', 'service'),
  -- cashier
  ('cashier', 'read', 'wallet'),
  ('cashier', 'create', 'payment'),
  ('cashier', 'create', 'receipt'),
  ('cashier', 'read', 'receipt'),
  -- packer
  ('packer', 'read', 'service'),
  ('packer', 'read', 'receipt'),
  -- accountant
  ('accountant', 'read', 'wallet'),
  ('accountant', 'read', 'payment'),
  ('accountant', 'read', 'refund'),
  ('accountant', 'read', 'receipt'),
  ('accountant', 'read', 'reconciliation'),
  ('accountant', 'read', 'report'),
  ('accountant', 'create', 'report'),
  -- treasury
  ('treasury', 'manage', 'float'),
  ('treasury', 'manage', 'reconciliation'),
  ('treasury', 'create', 'refund'),
  ('treasury', 'read', 'refund'),
  ('treasury', 'read', 'report'),
  -- admin
  ('admin', 'manage', 'user'),
  ('admin', 'manage', 'service'),
  ('admin', 'manage', 'receipt'),
  ('admin', 'manage', 'refund'),
  ('admin', 'read', 'wallet'),
  ('admin', 'read', 'audit'),
  ('admin', 'read', 'report'),
  -- super_admin: full wildcard
  ('super_admin', '*', '*')
ON CONFLICT (role, action, resource) DO NOTHING;
