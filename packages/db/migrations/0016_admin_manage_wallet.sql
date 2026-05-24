-- P1-E03-S07: grant admin `manage wallet`, which gates the per-parent
-- auto-credit toggle (admin + super_admin only; reception/cashier hold only
-- `read wallet` and so cannot flip it). Additive-only — mirrors the matrix
-- update in packages/auth/src/rbac.ts (the snapshot test enforces parity).

INSERT INTO permissions (role, action, resource) VALUES
  ('admin', 'manage', 'wallet')
ON CONFLICT (role, action, resource) DO NOTHING;
