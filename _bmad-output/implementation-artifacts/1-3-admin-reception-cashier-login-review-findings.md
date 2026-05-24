# Review findings — P1-E01-S03 (admin/reception/cashier login)

Self-review, 2026-05-25. Gate (test/typecheck/lint/build) green before review. No
BLOCKER/high issues found. Lower-severity items logged below (not fixed inline).

## Low

- **L1 — Deliberate spec deviation (auth mechanism).** The story file's AC3/Technical
  Notes describe staff auth as email + password (argon2id, ≥10 chars, mixed) with a
  `users.user_type ENUM`. The orchestrator's design guidance explicitly overrides this:
  reuse the existing phone+PIN primitives, add a `role` column (taxonomy shared with
  RBAC story 1-6), and do NOT duplicate the parent login. Implementation follows the
  orchestrator guidance. If product later wants distinct staff email+password
  credentials, that is a follow-up (additive: add `email`/`password_hash` columns + a
  complexity rule); the `role` column and role-based landing here remain valid.

- **L2 — Not-staff 403 confirms the account exists.** `/auth/staff/login` returns a
  distinct 403 ("Not a staff account") when credentials are valid but the user is a
  parent. This is a minor enumeration signal, but only to someone who already holds the
  account's correct PIN (i.e. the account owner), so the risk is negligible. Kept the
  403 because it gives a genuine parent a useful "use the other login" hint.

- **L3 — Admin-side role surfacing is minimal.** `apps/admin/lib/role-landing.ts`
  provides a `surfaceLabel(role)` helper (with tests) but no full nav shell — the
  role-gated admin shell is owned by epic 10 (10-1 nav-shell-role-gated-routes). The
  API is the source of truth for landing; the admin helper is dependency-free on purpose
  (avoids pulling the native argon2 binding from `@bm/auth` into the Next bundle).

- **L4 — Rate limiter shared across parent + staff flows by `(phone, ip)`.** A staff
  phone and a parent phone are distinct keys, so flows don't interfere. The limiter
  remains in-memory (per the existing TODO to move to Redis in SSO story 1-4).
