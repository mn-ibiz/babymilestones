# Story 6.3: Treasury role + permissions

Status: done

> Canonical ID: P1-E06-S03 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S03.md

## Story

As admin,
I want only the accountant to be able to approve adjusting entries,
so that financial corrections stay controlled.

## Acceptance Criteria

1. New role `treasury` seeded.
2. Permission `treasury.approve_adjustment` granted to `treasury` and `super_admin`.
3. Reconciliation screen accessible to `admin`, `treasury`, `super_admin`; adjustment approval requires the permission.

## Tasks / Subtasks

- [x] Task 1: Seed treasury role + permission (AC: #1, #2)
  - [x] Additive migration/seed in `packages/db` — `treasury` role already seeded (0005); new migration `0027_role_capabilities.sql` adds named capability `treasury.approve_adjustment`, granted to `treasury` and `super_admin`. New `role_capabilities` table + Drizzle schema.
- [x] Task 2: Role guards in auth (AC: #2, #3)
  - [x] `packages/auth/src/rbac.ts` — added `CAPABILITIES`/`CAPABILITY_MATRIX`, `hasCapability`, `requireCapability`, `canApproveAdjustment`, `canViewReconciliation` (+ `RECONCILIATION_VIEW_ROLES` = admin/treasury/super_admin), `capabilityMatrixRows`. Exported from `@bm/auth`.
- [x] Task 3: Wire guards into treasury routes (AC: #3)
  - [x] `apps/api/src/routes/treasury/reconciliation.ts` — screen access uses `canViewReconciliation`; approval/reject use the `treasury.approve_adjustment` capability via `canApproveAdjustment`; `audit_outbox` write on approve was already present (`treasury.reconciliation.adjustment.approve`).
- [~] Task 4: Admin UI gating (AC: #3)
  - [~] `apps/admin/lib/reconciliation.ts` `canApproveAdjustment`/`canApprovePosted` gate the approve CTA to capability-holders (treasury/super_admin) and enforce no self-approval; unit-tested. Deferred: no reconciliation `page.tsx` renders these helpers yet — the reconciliation screen page is a P1-E06-S02 deliverable not built in that story; gating logic is in place and tested for when the page lands. Server enforcement is authoritative regardless.
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Unit: capability grant matrix (treasury/super_admin yes; admin/accountant/reception no) + `requireCapability` guard + capability snapshot drift gate (`packages/auth/src/rbac.test.ts`); db seed mirror drift gate (`packages/db/src/permissions.test.ts`).
  - [x] Integration: admin/treasury/super_admin can open reconciliation; super_admin + treasury approve, admin gets 403 (`apps/api/src/routes/treasury/reconciliation.test.ts`).
  - [~] E2E: covered at the integration layer (app.inject with real staff sessions + CSRF); no separate Playwright `e2e/` spec added — deferred to the reconciliation screen E2E (S02 surface).

## Dev Notes

- Role/permission model lives in `@bm/auth` + seed data in `packages/db`. `treasury.approve_adjustment` is granted to `treasury` and `super_admin` only — `admin` can post adjustments and view the screen but cannot approve (dual-approval, see P1-E06-S02).
- Reconciliation screen access is broader (`admin`, `treasury`, `super_admin`) than the approval permission — enforce both separately, server-side.
- Source paths to touch: `packages/db` (role/permission seed), `packages/auth` (guards), `apps/api/src/routes/treasury/*` (apply guards), `apps/admin` Treasury (UI gating).
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Role guards in `packages/auth`; seed in `packages/db`; enforcement on `apps/api/src/routes/treasury/` routes.
- Dependency (from source): P1-E01-S06 (RBAC roles/permissions foundation). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E06-S03.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E06.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test` (all workspaces), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- `@bm/auth` suite: 73 tests pass; capability snapshot written intentionally (`-u`).

### Completion Notes List

- Introduced a **named-capability** layer alongside the existing `(action, resource)` matrix. `treasury.approve_adjustment` is the first capability: a discrete, high-trust action granted to an explicit role allow-list (treasury + super_admin), independent of the coarse resource grant. This precisely encodes AC2 — `admin` may post adjustments and open the reconciliation screen but cannot approve (dual-approval).
- `super_admin` holds every capability via its existing wildcard (handled in `hasCapability`).
- Reconciliation screen access (AC3) is broader than approval: `RECONCILIATION_VIEW_ROLES` = admin/treasury/super_admin (`canViewReconciliation`); accountant retains `read reconciliation` for exports.
- Drift gates: code↔db parity guarded by the new capability snapshot test in `@bm/auth` and the `role_capabilities` seed-mirror test in `@bm/db` (mirrors migration 0027, independent of `@bm/auth` to keep db the lower layer).
- Migration 0027 is additive-only. Approval already writes `audit_outbox` (`treasury.reconciliation.adjustment.approve`) from S02.
- Admin lib mirrors (does not import) the capability allow-list to keep the native argon2 binding out of the Next bundle — same pattern as `role-landing.ts`/`impersonation-banner.ts`.

### File List

- `packages/auth/src/rbac.ts` (capability layer: CAPABILITIES, CAPABILITY_MATRIX, hasCapability, requireCapability, canApproveAdjustment, canViewReconciliation, RECONCILIATION_VIEW_ROLES, capabilityMatrixRows, CapabilityRow)
- `packages/auth/src/index.ts` (exports)
- `packages/auth/src/rbac.test.ts` (capability tests + snapshot)
- `packages/auth/src/__snapshots__/rbac.test.ts.snap` (capability snapshot)
- `packages/db/migrations/0027_role_capabilities.sql` (new, additive)
- `packages/db/src/schema/permissions.ts` (roleCapabilities table + RoleCapabilityRow)
- `packages/db/src/permissions.test.ts` (capability seed drift gate)
- `apps/api/src/routes/treasury/reconciliation.ts` (capability + view-role wiring)
- `apps/api/src/routes/treasury/reconciliation.test.ts` (super_admin approve + view tests)
- `apps/admin/lib/reconciliation.ts` (capability-aligned comments)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Treasury named-capability `treasury.approve_adjustment` + guards, migration 0027, drift gates, tests; status done | claude-opus-4-7 |
