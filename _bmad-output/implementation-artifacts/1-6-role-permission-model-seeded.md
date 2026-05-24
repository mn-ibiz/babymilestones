# Story 1.6: Role + Permission model seeded

Status: done

> Canonical ID: P1-E01-S06 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S06.md

## Story

As a developer,
I want a stable role taxonomy with a single source of truth,
so that every guard reads permissions from one place.

## Acceptance Criteria

1. Roles seeded: `parent`, `reception`, `cashier`, `packer`, `accountant`, `treasury`, `admin`, `super_admin`.
2. Permissions table (`role`, `action`, `resource`) referenced by API middleware.
3. Super-admin role can impersonate (`actAs`) with a visible banner — both real and impersonated user IDs in audit log.
4. Role mutation invalidates the user's active sessions.

## Tasks / Subtasks

- [x] Task 1: Schema + seed (AC: #1, #2)
  - [x] `packages/db` — additive migration `0005_roles_permissions.sql` for `roles` + `permissions` (`role`, `action`, `resource`)
  - [x] Seed the 8 roles and their permission rows (mirrors `PERMISSION_MATRIX`)
- [x] Task 2: RBAC enforcement (AC: #2)
  - [x] `packages/auth/src/rbac.ts` — `can(role, action, resource)` + `requirePermission(action, resource)` guard; server-side only (never trust client)
  - [~] Hook RBAC into the shared API middleware — exported framework-agnostic `requirePermission` guard ready for routes/middleware to consume; no live route yet gates a permission (resources land with their owning P1 stories), so wiring is deferred to those stories rather than added speculatively
- [x] Task 3: Super-admin impersonation (AC: #3)
  - [x] `actAs` restricted to `super_admin`; returns audit input recording BOTH real and impersonated user IDs (action `rbac.impersonate`)
  - [x] Visible impersonation banner in `apps/admin` (`lib/impersonation-banner.ts`, `x-bm-acting-as` header)
- [x] Task 4: Session invalidation on role change (AC: #4)
  - [x] `invalidateSessionsOnRoleChange` calls `SessionStore.destroyAllForUser` (Redis `DEL` in prod store)
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Snapshot test of the permission matrix (`packages/auth/src/rbac.test.ts`); CI fails on drift. DB-side mirror test in `packages/db/src/permissions.test.ts`
  - [x] Unit: `can()` allow/deny cases; super_admin-only `actAs`
  - [x] Integration: role mutation invalidates sessions; impersonation writes both IDs to audit input

## Dev Notes

- Permissions are enforced server-side via `packages/auth/src/rbac.ts`; the client is never trusted. RBAC is consumed by the shared API middleware (the same `packages/auth/src/middleware.ts` from S04).
- Roles and the `(role, action, resource)` permissions table live in `packages/db` (additive migration + seed). The permission matrix is snapshot-tested so CI fails on undocumented drift.
- Impersonation (`actAs`) is super_admin-only, shows a visible banner, and logs both real and impersonated user IDs. Role mutation triggers Redis session invalidation.
- Source paths to touch: `packages/auth/src/rbac.ts`, `packages/auth/src/middleware.ts`, `packages/db` (roles/permissions migration + seed), `apps/admin` (impersonation banner).
- Testing standards: vitest, TS strict, test-first. The permission-matrix snapshot drift gate is mandatory per source "Tests".

### Project Structure Notes
- New `packages/auth/src/rbac.ts` + permissions migration/seed in `packages/db`; middleware integration shared with S04.
- Dependency (from source): S01 (`users` exist to attach roles to).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E01-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E01.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green from repo root.
- New auth suite `src/rbac.test.ts` (12 tests) + snapshot `src/__snapshots__/rbac.test.ts.snap`.
- New db suite `src/permissions.test.ts` (seed + drift gate against PGlite).

### Completion Notes List

- Single source of truth for the role taxonomy + `(role, action, resource)` matrix lives in `packages/auth/src/rbac.ts` (`PERMISSION_MATRIX`). The migration `0005_roles_permissions.sql` seeds `roles` + `permissions` to mirror it; two drift gates protect this: the auth snapshot test (code side) and the db mirror test (migration side).
- `requirePermission(action, resource)` is the framework-agnostic guard (returns a discriminated 403 outcome) — server-side enforcement only, pairs with the existing `validateSession` principal. Live route wiring deferred to the stories that introduce each guarded resource.
- `actAs` is super_admin-only (throws `ImpersonationDeniedError` otherwise) and returns an audit input carrying BOTH the real and impersonated user ids (action `rbac.impersonate`, both ids in `payload`), plus a banner signal. `apps/admin/lib/impersonation-banner.ts` renders the visible banner from the `x-bm-acting-as` header (kept dependency-free, mirroring `role-landing.ts`, so the Next bundle never pulls argon2).
- `invalidateSessionsOnRoleChange` delegates to `SessionStore.destroyAllForUser` so a role change immediately drops every active session (AC4).
- Migrations additive-only; `IF NOT EXISTS` + `ON CONFLICT DO NOTHING` keep re-runs idempotent. No `child_process`/`.exec` usage.

### File List

- `packages/auth/src/rbac.ts` (new)
- `packages/auth/src/rbac.test.ts` (new)
- `packages/auth/src/__snapshots__/rbac.test.ts.snap` (new)
- `packages/auth/src/index.ts` (export rbac)
- `packages/db/migrations/0005_roles_permissions.sql` (new)
- `packages/db/src/schema/permissions.ts` (new)
- `packages/db/src/schema/index.ts` (barrel)
- `packages/db/src/permissions.test.ts` (new)
- `apps/admin/lib/impersonation-banner.ts` (new)
- `apps/admin/lib/impersonation-banner.test.ts` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented role + permission model: taxonomy/matrix + `requirePermission` guard, `actAs` impersonation, role-change session invalidation, seed migration, snapshot drift gates | claude-opus-4-7 |
