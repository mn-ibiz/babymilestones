-- P1-E01-S03: add role to users for staff login + role-based landing.
-- Additive-only. Default 'parent' keeps every existing row valid.
-- Allowed roles (taxonomy shared with RBAC story P1-E01-S06):
--   parent, reception, cashier, packer, accountant, treasury, admin, super_admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'parent';
