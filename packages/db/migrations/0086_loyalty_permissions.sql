-- P3-E04-S03: admin manual loyalty adjustment is gated by `manage loyalty`.
-- Additive grant; mirrors PERMISSION_MATRIX (admin: manage loyalty).
-- super_admin already covers this via its (*,*) wildcard.
INSERT INTO permissions (role, action, resource) VALUES
  ('admin', 'manage', 'loyalty')
ON CONFLICT (role, action, resource) DO NOTHING;
