# Story 15.4: CI/CD pipelines (per app)

Status: ready-for-dev

> Canonical ID: X8-S04 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/X8-S04.md

## Story

As a developer,
I want every PR built and tested and every main merge deployed,
so that changes ship safely with gated migrations and a rehearsed rollback.

## Acceptance Criteria

1. PR pipeline: lint, type-check, unit + integration tests, build all apps.
2. Migrations applied in a gated step before deploy.
3. Preview environments for PRs (one per PR).
4. One-click rollback documented and rehearsed.

## Tasks / Subtasks

- [ ] Task 1: PR pipeline (AC: #1)
  - [ ] Extend `.github/workflows/ci.yml` (already present) so PRs run lint, type-check, unit + integration tests (`pnpm test` across workspaces via Turborepo) and build all apps (`apps/api`, `apps/platform`, `apps/pos`, `apps/admin`, `apps/jobs`).
- [ ] Task 2: Gated migration step before deploy (AC: #2)
  - [ ] Add a deploy workflow (on main merge) that applies `packages/db` migrations in a gated step before app deploy (fail-closed if migrations fail).
- [ ] Task 3: Per-PR preview environments (AC: #3)
  - [ ] Provision one preview environment per PR (per-app) and tear down on close.
- [ ] Task 4: Rollback (AC: #4)
  - [ ] Document a one-click rollback procedure and rehearse it (runbook alongside the deploy workflow / `infra/`).
- [ ] Task 5: Tests/verification (AC: all)
  - [ ] Validate workflows (e.g. `act`/lint or a dry-run job); confirm the gated-migration step blocks deploy on failure. Test-first where feasible.

## Dev Notes

- Anchor: `.github/workflows/ci.yml` already exists — build the per-app pipelines on top of it rather than replacing it. Monorepo is pnpm + Turborepo; tests are vitest via `pnpm test` per workspace.
- Migrations come from `packages/db` and must be additive-only; the gated pre-deploy step applies them.
- Rollback runbook documented + rehearsed (manual but one-click).

### Project Structure Notes
- Extend `.github/workflows/ci.yml`; add deploy/preview workflows under `.github/workflows/`. Rollback runbook under `infra/` or docs. Migration apply targets `packages/db`.
- Dependencies: none. (Note: X5-S02 audit drain worker lists X8 as a dependency — this jobs/CI foundation supports that.)

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/X8-S04.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md § X8]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
