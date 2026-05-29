-- P2-E04-S02: grant the till-facing roles read access to the product catalogue.
-- Additive-only — mirrors the `product` resource + matrix update in
-- packages/auth/src/rbac.ts (the snapshot test enforces parity). The POS reads
-- products to scan/search and show price + stock; nobody manages products here
-- (catalogue CRUD lands in P4-E01; super_admin holds it via its wildcard).

INSERT INTO permissions (role, action, resource) VALUES
  ('reception', 'read', 'product'),
  ('cashier',   'read', 'product'),
  ('packer',    'read', 'product')
ON CONFLICT (role, action, resource) DO NOTHING;
