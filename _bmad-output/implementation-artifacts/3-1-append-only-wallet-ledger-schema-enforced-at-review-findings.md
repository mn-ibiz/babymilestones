# Review findings — P1-E03-S01 (append-only wallet_ledger)

Single review pass. No BLOCKER/high-severity issues. One low-severity item deferred:

## LOW — `bm_app` role provisioning is out of scope here
AC2 names a `REVOKE UPDATE, DELETE` from the `bm_app` Postgres role. Migration 0011
applies that REVOKE/GRANT, but guards it behind `IF EXISTS (... rolname = 'bm_app')`
because the role is not created by any migration in this repo yet (and PGlite is
single-superuser, so REVOKE is a no-op there regardless). Append-only is therefore
enforced by the portable **trigger** (RAISE on UPDATE/DELETE), which holds even for
the table owner/superuser and is fully tested.

Follow-up (infra/ops, not this story): create the `bm_app` role + grant baseline
in the deployment provisioning so the production REVOKE branch actually fires. The
trigger remains the source-of-truth guarantee either way.
