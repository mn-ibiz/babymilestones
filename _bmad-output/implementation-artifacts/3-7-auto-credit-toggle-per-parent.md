# Story 3.7: Auto-credit toggle per parent

Status: ready-for-dev

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

- [ ] Task 1: Schema (AC: #1)
  - [ ] Migration in `packages/db/migrations/` adding `parents.auto_credit_enabled BOOLEAN NOT NULL DEFAULT FALSE`; additive-only.
- [ ] Task 2: Toggle endpoint with role guard (AC: #2, #3)
  - [ ] Add a toggle route under `apps/api/src/routes/` enforcing permission `parents.toggle_auto_credit` → `admin`, `super_admin` (Reception denied), via `packages/auth`.
  - [ ] Write the toggle change to `audit_outbox` (before/after value, actor).
- [ ] Task 3: Reception UI (AC: #2)
  - [ ] Surface the toggle on the parent header in the admin/Reception console (`apps/admin`); render disabled/non-actionable for non-admin roles.
- [ ] Task 4: Tests (all)
  - [ ] Tests: default FALSE (AC1); admin/super_admin can flip, Reception/other roles rejected (AC2); toggle change writes an audit record (AC3).

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
