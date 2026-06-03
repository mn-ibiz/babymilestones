# Review findings — P1-E01-S06 (role + permission model seeded)

Sweep review 2026-06-03 (adversarial: blind + edge + acceptance). Reviewed against commit
`0e2f390`. All 4 ACs implemented; security core is sound (default-deny, no privilege escalation,
additive idempotent seed, super_admin-only `actAs`, session invalidation on role change). 2 noise
findings dismissed. **1 raised for your decision, 3 deferred** (mostly downstream wiring). No code
changed.

## Decision needed (collected, not auto-fixed)

- **[Decision][MED] Drift gate doesn't couple the code matrix to the DB-seeded rows.**
  `packages/auth/src/rbac.test.ts` snapshots `PERMISSION_MATRIX`; `packages/db/src/permissions.test.ts`
  compares seeded rows to a hand-copied literal. Neither cross-checks the two, and `@bm/db` doesn't
  depend on `@bm/auth`. So editing the matrix + regenerating the snapshot (without a seed migration)
  passes CI green while code/DB diverge — weaker than the spec's "drifts without migration fails CI."
  **Decision:** (A) derive the db test's expected rows from the seed SQL + add a cross-check test in
  a layer that may import both packages; or (B) hoist the canonical matrix into a shared package and
  generate the seed SQL from it.

## Deferred / tracked (downstream wiring, per impl notes)
- **[Defer] AC3 impersonation audit never persisted.** `rbac.ts:333-351` `actAs()` returns a correct
  audit input but no route calls `audit(db, actAs(...).audit)` yet. Wire in the story that adds the
  impersonation route + integration test.
- **[Defer] AC2 `requirePermission` unused by middleware.** `middleware.ts` only does session/CSRF/
  role-app guarding; wire per-resource permission checks as guarded routes land.
- **[Defer] Seed `ON CONFLICT DO NOTHING` can't correct a changed row.** Fine for additive seeding;
  permission *revocation* needs an explicit DELETE migration — document the convention.

## Dismissed
`can(action)` wildcard not user-input reachable (guards built from literals); `roles`-before-
`permissions` FK ordering is correct.
