# Story 6.3: Treasury role + permissions

Status: ready-for-dev

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

- [ ] Task 1: Seed treasury role + permission (AC: #1, #2)
  - [ ] Additive migration/seed in `packages/db` — add `treasury` role; add permission `treasury.approve_adjustment`; grant to `treasury` and `super_admin`
- [ ] Task 2: Role guards in auth (AC: #2, #3)
  - [ ] `packages/auth` — expose guard for `treasury.approve_adjustment`; allow reconciliation-screen access for `admin`, `treasury`, `super_admin`
- [ ] Task 3: Wire guards into treasury routes (AC: #3)
  - [ ] Apply screen-access guard to reconciliation route (P1-E06-S02); apply `treasury.approve_adjustment` guard to the adjustment-approval endpoint; write `audit_outbox` on approval
- [ ] Task 4: Admin UI gating (AC: #3)
  - [ ] `apps/admin` Treasury — show approval action only when caller holds `treasury.approve_adjustment` (server still enforces)
- [ ] Task 5: Tests per source "Tests" section (AC: all)
  - [ ] Unit: permission grant matrix (treasury/super_admin yes; admin no for approval) (vitest, test-first)
  - [ ] Integration: admin/treasury/super_admin can open reconciliation; only permission-holders approve; others get 403
  - [ ] E2E: treasury user approves; admin-only user is blocked from approving

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
