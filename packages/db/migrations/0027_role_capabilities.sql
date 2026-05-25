-- P1-E06-S03: named capabilities — fine-grained, high-trust actions granted to
-- an explicit role allow-list, independent of the coarse (action, resource)
-- permission matrix. Additive-only. The seeded rows MIRROR CAPABILITY_MATRIX in
-- packages/auth/src/rbac.ts; the capability snapshot test fails CI if code drifts
-- from this migration. Enforcement is server-side via requireCapability(...).

CREATE TABLE IF NOT EXISTS role_capabilities (
  role       text NOT NULL REFERENCES roles(role),
  capability text NOT NULL,
  PRIMARY KEY (role, capability)
);

-- AC2: treasury.approve_adjustment is reserved to treasury + super_admin. Admin
-- may post adjustments and view the reconciliation screen but cannot approve
-- (dual-approval, see P1-E06-S02).
INSERT INTO role_capabilities (role, capability) VALUES
  ('treasury', 'treasury.approve_adjustment'),
  ('super_admin', 'treasury.approve_adjustment')
ON CONFLICT (role, capability) DO NOTHING;
