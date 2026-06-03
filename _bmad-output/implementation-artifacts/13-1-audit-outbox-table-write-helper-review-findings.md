# Review findings — X5-S01 (audit_outbox table + write helper)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `475c9e0a`.
AC1–AC3 implemented & tested (incl. a real atomic-rollback proof). 64 db tests pass.

## Patched this review
- **[Patch] Added a loud ATOMICITY CONTRACT to `audit()` JSDoc** — the helper accepts the top-level
  `db` as readily as a `tx`, so the non-atomic path is the path of least resistance (and some call
  sites already use it, e.g. `review-snippets.ts`). Documented that a paired business write must share
  the `tx`. `packages/db/src/audit.ts`. db typecheck + audit tests green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Structurally enforce the atomicity contract** — beyond the JSDoc: provide
  `auditInTx(tx,…)` / `auditStandalone(db,…)` named entry points, or a lint rule that any `audit()`
  beside a write shares the executor.
- **[Decision][MED · audit integrity] `audit_outbox` has no DB-layer DELETE/immutability protection**
  (sibling `wallet_ledger` has triggers + role REVOKE). The outbox isn't strictly append-only (the
  X5-S02 drain updates `processed_at`/attempts), so it needs a *column-aware* immutability trigger
  (content columns frozen; worker bookkeeping updatable) + `bm_app` GRANT/REVOKE.

## Deferred / tracked
- **[Defer] `@electric-sql/pglite` is in `dependencies`, not `devDependencies`** (ships WASM in prod).
  Blocked: `Database` is typed off PgliteDatabase; move it when the prod postgres-js wiring lands.

## Dismissed
Migration `.sort()` (4-digit prefixes); `gen_random_uuid()` (PG13+ core); `row!`; `.default({})` SQL default.
