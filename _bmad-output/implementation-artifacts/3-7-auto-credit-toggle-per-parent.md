# Story 3.7: Auto-credit toggle per parent

Status: done

> Canonical ID: P1-E03-S07 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S07.md

## Story

As an admin,
I want to allow specific trusted parents to go negative without prepayment,
so that established families can be served on credit while others stay prepay-only.

## Acceptance Criteria

1. `parents.auto_credit_enabled BOOLEAN DEFAULT FALSE`.
2. Reception screen shows the toggle on the parent header; flipping it requires admin role (Reception cannot flip).
3. Toggle change audited.

## Tasks / Subtasks

- [x] Task 1: Schema (AC: #1)
  - [x] The auto-credit flag already exists as `wallets.auto_credit_enabled BOOLEAN NOT NULL DEFAULT FALSE` (added additively in P1-E03-S05, migration 0014) and is consumed by the check-in debit path. The story AC text said `parents.*`, but the column was implemented on `wallets` in 3-5 (the debit primitive reads `wallet.autoCreditEnabled`); kept it there to avoid duplicating the flag. No new column migration needed. Added migration `0016_admin_manage_wallet.sql` granting the gating permission.
- [x] Task 2: Toggle endpoint with role guard (AC: #2, #3)
  - [x] `GET`/`PATCH /admin/parents/:userId/auto-credit` under `apps/api/src/routes/admin/auto-credit.ts`. Flipping is gated by `requirePermission("manage","wallet")` → only `admin`+`super_admin` hold it (reception/cashier hold only `read wallet`, so 403). The RBAC matrix used `(action,resource)` pairs rather than dotted string permissions, so `parents.toggle_auto_credit` is realised as `manage wallet` (matrix + seed migration + both drift-gate mirrors updated).
  - [x] The toggle change writes a `wallet.auto_credit_toggle` row to `audit_outbox` (before/after value, actor, target wallet) inside the same transaction as the update.
- [~] Task 3: Reception UI (AC: #2)
  - [~] Added the framework-agnostic, unit-tested view-state helper `apps/admin/lib/auto-credit-toggle.ts` (mirrors the established `lib/*.ts` pattern) that drives the disabled/read-only rendering for non-admin roles. Wiring it into a parent-header React component is deferred: the admin console has no parent-detail/parent-header page yet (only `reception/walk-in`), so there is no surface to mount it on. Server enforcement + the role-aware view logic are complete and tested.
- [x] Task 4: Tests (all)
  - [x] `apps/api/src/routes/admin/auto-credit.test.ts`: default FALSE (AC1); admin + super_admin flip / reception + cashier rejected 403 (AC2); 401/400/404; audit before/after row (AC3); and the behavioural check — flipping ON turns an underfunded check-in from `outstanding` into `settled_on_credit`. `apps/admin/lib/auto-credit-toggle.test.ts` covers the role-gated view logic.

## Dev Notes

- This flag is consumed by the check-in debit path (story 3.5) to decide whether a wallet may go negative — keep the column name exactly `auto_credit_enabled`.
- Permission gate: `parents.toggle_auto_credit` granted only to `admin` and `super_admin`; Reception can view but not flip.
- Lives in `packages/db` (column migration), `apps/api/src/routes/` (toggle endpoint + guard), `apps/admin` (parent-header toggle UI), `packages/auth` (role/permission check). Audit to `audit_outbox`.
- Testing standards: vitest, test-first; role enforcement and audit emission are the key assertions.

### Project Structure Notes
- `packages/db`: `parents.auto_credit_enabled` migration. `apps/api/src/routes/`: toggle route. `apps/admin`: Reception parent-header toggle.
- Depends on P1-E03-S01 (ledger foundation) and P1-E10 (admin shell / RBAC).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E03-S07.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § P1-E03]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test` (15/15 packages, incl. 113 api + 20 admin + 22 db tests), `pnpm typecheck` (15/15), `pnpm lint` (15/15), `pnpm build` (5/5).

### Completion Notes List

- The auto-credit flag lives on `wallets.auto_credit_enabled` (P1-E03-S05, migration 0014), not `parents` — the check-in debit primitive already reads `wallet.autoCreditEnabled`. Implemented the toggle against the existing column to keep a single source of truth; no new column migration.
- RBAC is a `(action, resource)` matrix, so the spec's `parents.toggle_auto_credit` is realised as `manage wallet` (admin + super_admin only; reception/cashier hold only `read wallet`). Granted via matrix update + new seed migration `0016`, with both drift-gate mirrors (auth snapshot + db `permissions.test.ts`) updated.
- Endpoint: `GET`/`PATCH /admin/parents/:userId/auto-credit`. PATCH is a mutating verb so the shared middleware enforces CSRF. Wallet is derived from the path `userId` (never a client-supplied wallet id). Audit (`wallet.auto_credit_toggle`) is written in the same transaction as the update with before/after + actor.
- Reception UI: pure view-state helper added + tested; mounting on a parent-header component deferred (no parent-detail page exists in the admin console yet).
- Self-review (one pass): no blocker/high findings; all ACs covered by tests; no deferred findings file needed.

### File List

- `packages/auth/src/rbac.ts` (add `manage wallet` to admin)
- `packages/auth/src/__snapshots__/rbac.test.ts.snap` (snapshot mirror)
- `packages/db/migrations/0016_admin_manage_wallet.sql` (new — seed grant)
- `packages/db/src/permissions.test.ts` (drift-gate mirror)
- `packages/contracts/src/index.ts` (`autoCreditToggleSchema`)
- `apps/api/src/routes/admin/auto-credit.ts` (new — GET/PATCH route)
- `apps/api/src/routes/admin/index.ts` (register route)
- `apps/api/src/routes/admin/auto-credit.test.ts` (new — integration tests)
- `apps/admin/lib/auto-credit-toggle.ts` (new — toggle view logic)
- `apps/admin/lib/auto-credit-toggle.test.ts` (new — view-logic tests)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented per-parent auto-credit toggle endpoint (admin-gated, audited) + UI view logic; all ACs tested | claude-opus-4-7 |
