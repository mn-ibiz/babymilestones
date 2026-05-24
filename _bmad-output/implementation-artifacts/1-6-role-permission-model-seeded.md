# Story 1.6: Role + Permission model seeded

Status: ready-for-dev

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

- [ ] Task 1: Schema + seed (AC: #1, #2)
  - [ ] `packages/db` — additive migration for roles + permissions table (`role`, `action`, `resource`)
  - [ ] Seed the 8 roles: `parent`, `reception`, `cashier`, `packer`, `accountant`, `treasury`, `admin`, `super_admin` and their permission rows
- [ ] Task 2: RBAC enforcement (AC: #2)
  - [ ] `packages/auth/src/rbac.ts` — `can(role, action, resource)` reading the permissions table; enforced server-side only (never trust client)
  - [ ] Hook RBAC into the shared API middleware (`packages/auth/src/middleware.ts`)
- [ ] Task 3: Super-admin impersonation (AC: #3)
  - [ ] `actAs` capability restricted to `super_admin`; record both real and impersonated user IDs in `audit_outbox`
  - [ ] Surface a visible impersonation banner in the consuming apps (`apps/admin`)
- [ ] Task 4: Session invalidation on role change (AC: #4)
  - [ ] Mutating a user's role invalidates that user's active sessions (Redis `DEL`)
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Snapshot test of the permission matrix; CI fails if it drifts without an accompanying migration
  - [ ] Unit: `can()` allow/deny cases; super_admin-only `actAs`
  - [ ] Integration: role mutation invalidates sessions; impersonation writes both IDs to audit

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
